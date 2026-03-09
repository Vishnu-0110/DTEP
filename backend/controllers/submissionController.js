const Submission = require('../models/Submission');
const Task = require('../models/Task');
const fs = require('fs');
const path = require('path');
const { evaluateAnswer, evaluateDetailedAnswer } = require('../utils/aiEvaluation');
const { extractPDFText } = require('../utils/pdfTextExtractor');
const { resolveUploadDir } = require('../config/storage');
const {
  MISSED_SUBMISSION_FEEDBACK,
  isMissedSubmission,
  syncMissedSubmissions,
} = require('../utils/missedSubmissionSync');

const uploadRoot = resolveUploadDir();
const NO_READABLE_CONTENT_MESSAGE =
  'No readable assignment content was found. Paste the answer text or upload a text-based PDF.';
const PLACEHOLDER_ANSWER_PATTERNS = [
  /^student\s+submitted\s+file\s*:/i,
  /^student\s+uploaded\s+file\s*:/i,
  /^no\s+submission\s+text\s+provided/i,
];
const MISSING_CONTENT_FEEDBACK_PATTERNS = [
  /could not be evaluated/i,
  /not provided or accessible/i,
  /no points can be awarded/i,
];

const isPdfFile = (fileNameOrPath) =>
  String(fileNameOrPath || '').trim().toLowerCase().endsWith('.pdf');
const looksLikePlaceholderAnswer = (value) => {
  const text = String(value || '').trim();
  if (!text) return true;
  return PLACEHOLDER_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
};
const normalizeReadableAnswer = (value) => {
  const text = String(value || '').trim();
  return looksLikePlaceholderAnswer(text) ? '' : text;
};
const looksLikeMissingContentFeedback = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return MISSING_CONTENT_FEEDBACK_PATTERNS.every((pattern) => pattern.test(text));
};

const appendMissingPoints = (feedbackText = '', missingPoints = '') => {
  const cleanFeedback = String(feedbackText || '').trim();
  const cleanMissing = String(missingPoints || '').trim();

  if (!cleanMissing) return cleanFeedback;
  if (cleanFeedback.toLowerCase().includes(cleanMissing.toLowerCase())) return cleanFeedback;

  return cleanFeedback
    ? `${cleanFeedback}\n\nMissing Points: ${cleanMissing}`
    : `Missing Points: ${cleanMissing}`;
};

const cleanupUploadedFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (cleanupError) {
    console.warn(`Upload cleanup failed for ${filePath}: ${cleanupError.message}`);
  }
};

const extractSubmissionTextFromPdf = async (filePath) => {
  if (!filePath) return '';

  try {
    if (!fs.existsSync(filePath)) return '';
    return String(await extractPDFText(filePath)).trim();
  } catch (error) {
    console.warn(`PDF text extraction failed for ${filePath}: ${error.message}`);
    return '';
  }
};

const runPostSubmissionAnalysis = async ({
  submissionId,
  taskDescription,
  answerText,
  filePath,
  originalFileName,
  isPdfUpload,
}) => {
  try {
    const submission = await Submission.findById(submissionId);
    if (!submission) return;

    let derivedAnswer = normalizeReadableAnswer(answerText);

    if (!derivedAnswer && isPdfUpload && filePath) {
      derivedAnswer = await extractSubmissionTextFromPdf(filePath);
      derivedAnswer = normalizeReadableAnswer(derivedAnswer);
    }

    if (derivedAnswer && !normalizeReadableAnswer(submission.answer)) {
      submission.answer = derivedAnswer;
    }

    if (!derivedAnswer) {
      submission.aiMarks = null;
      submission.aiFeedback = NO_READABLE_CONTENT_MESSAGE;
      submission.missingPoints = '';
      submission.aiEvaluatedAt = new Date();
      submission.aiModel = null;
      submission.evaluationDetails = {
        ...(submission.evaluationDetails || {}),
        aiMarks: null,
        aiFeedback: NO_READABLE_CONTENT_MESSAGE,
        missingPoints: '',
      };
      await submission.save();
      return;
    }

    const answerForEvaluation = derivedAnswer.slice(0, 20000);
    const aiResult = await evaluateAnswer(taskDescription, answerForEvaluation);

    submission.aiMarks = aiResult.marks;
    submission.aiFeedback = aiResult.feedback;
    submission.missingPoints = aiResult.missingPoints;
    submission.aiEvaluatedAt = new Date();
    submission.aiModel = aiResult.model;
    submission.aiRawResponse = aiResult.raw;
    submission.evaluationDetails = {
      ...(submission.evaluationDetails || {}),
      aiMarks: aiResult.marks,
      aiFeedback: aiResult.feedback,
      missingPoints: aiResult.missingPoints,
    };

    await submission.save();
  } catch (analysisError) {
    console.error(`Background AI evaluation failed for submission ${submissionId}: ${analysisError.message}`);
  }
};

const toClientSubmission = (submissionDoc) => {
  const item = submissionDoc.toObject ? submissionDoc.toObject() : submissionDoc;

  const user = item.userId || item.student || null;
  const task = item.taskId || item.task || null;
  const evaluator = item.evaluatedBy || item.evaluator || null;
  const storedPath = String(item.submissionFile || item.fileUrl || '');
  const submissionFile = path.posix.basename(storedPath.replace(/\\/g, '/'));
  const remarks = item.remarks || item.feedback || '';
  const rawAiFeedback = item.aiFeedback || '';
  const aiFeedback = looksLikeMissingContentFeedback(rawAiFeedback)
    ? NO_READABLE_CONTENT_MESSAGE
    : rawAiFeedback;
  const feedback = appendMissingPoints(remarks || aiFeedback, item.missingPoints || '');
  const inferredStatus =
    typeof item.marks === 'number' || item.evaluatedAt || evaluator ? 'evaluated' : 'pending';

  return {
    ...item,
    userId: user?._id || user,
    taskId: task?._id || task,
    submissionFile,
    remarks,
    evaluatedBy: evaluator?._id || evaluator,
    evaluatedAt: item.evaluatedAt || null,
    fileName: item.fileName || submissionFile.split('/').pop() || 'submission-file',
    answer: item.answer || '',
    aiMarks: typeof item.aiMarks === 'number' ? item.aiMarks : null,
    aiFeedback,
    missingPoints: item.missingPoints || '',
    aiEvaluatedAt: item.aiEvaluatedAt || null,
    aiModel: item.aiModel || null,
    evaluationDetails: item.evaluationDetails || null,
    isAutoZero: Boolean(item.isAutoZero),

    // Legacy keys currently used by the frontend.
    student: user,
    task,
    fileUrl: submissionFile,
    feedback,
    evaluator,
    status: item.status || inferredStatus,
  };
};

const getSubmissionTaskRef = (submissionDoc) => submissionDoc?.taskId || submissionDoc?.task || null;

const getSubmissionStudentRef = (submissionDoc) => submissionDoc?.userId || submissionDoc?.student || null;

const normalizeStoredSubmissionPath = (submissionDoc) => {
  const rawPath = String(submissionDoc?.submissionFile || submissionDoc?.fileUrl || '').trim();
  if (!rawPath) return '';

  if (path.isAbsolute(rawPath)) {
    return path.normalize(rawPath);
  }

  const legacyResolvedPath = path.resolve(__dirname, '..', rawPath);
  if (fs.existsSync(legacyResolvedPath)) {
    return legacyResolvedPath;
  }

  const normalizedRelativePath = rawPath.replace(/^uploads[\\/]+/i, '');
  return path.resolve(uploadRoot, normalizedRelativePath);
};

const getMimeTypeForPath = (filePath) => {
  const extension = String(path.extname(filePath || '')).toLowerCase();

  if (extension === '.pdf') {
    return 'application/pdf';
  }

  if (extension === '.doc') {
    return 'application/msword';
  }

  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return 'application/octet-stream';
};

const isPathInsideUploads = (resolvedPath) => {
  const normalizedUploadRoot = path.resolve(uploadRoot) + path.sep;
  const normalizedResolved = path.resolve(resolvedPath);
  return normalizedResolved === path.resolve(uploadRoot) || normalizedResolved.startsWith(normalizedUploadRoot);
};

const ensureTaskAccess = async (req, taskDocOrId) => {
  const taskId = String(taskDocOrId?._id || taskDocOrId || '').trim();
  if (!taskId) {
    return { error: { status: 404, message: 'Task not found' } };
  }

  const taskDoc =
    taskDocOrId && typeof taskDocOrId === 'object' && taskDocOrId.createdBy
      ? taskDocOrId
      : await Task.findById(taskId).select('createdBy');

  if (!taskDoc) {
    return { error: { status: 404, message: 'Task not found' } };
  }

  const isAdmin = req.user?.role === 'admin';
  const isOwner = String(taskDoc.createdBy) === String(req.user?._id);

  if (!isAdmin && !isOwner) {
    return { error: { status: 403, message: 'Not authorized to access this task' } };
  }

  return { taskDoc };
};

const ensureSubmissionAccess = async (req, submissionDoc) => {
  if (!submissionDoc) {
    return { error: { status: 404, message: 'Submission not found' } };
  }

  if (req.user?.role === 'admin') {
    return { submissionDoc };
  }

  if (req.user?.role === 'student') {
    const studentRef = getSubmissionStudentRef(submissionDoc);
    const isOwner = String(studentRef?._id || studentRef || '') === String(req.user?._id || '');

    if (!isOwner) {
      return { error: { status: 403, message: 'Not authorized to access this submission' } };
    }

    return { submissionDoc };
  }

  const taskRef = getSubmissionTaskRef(submissionDoc);
  const access = await ensureTaskAccess(req, taskRef);
  if (access.error) {
    return access;
  }

  return { submissionDoc, taskDoc: access.taskDoc };
};

exports.submitTask = async (req, res) => {
  const { taskId } = req.params;
  try {
    if (!req.file) return res.status(400).json({ message: 'Please upload a file' });
    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const findExistingSubmission = () => Submission.findOne({
      $or: [
        { taskId, userId: req.user._id },
        { task: taskId, student: req.user._id }
      ]
    }).sort('-submittedAt');

    if (new Date(task.deadline).getTime() < Date.now()) {
      await syncMissedSubmissions({ taskIds: [taskId], studentId: req.user._id });
      const missedSubmission = await findExistingSubmission();
      cleanupUploadedFile(req.file?.path);

      return res.status(409).json({
        message: 'Deadline has passed. This assignment was auto-marked 0 for non-submission.',
        submission: missedSubmission ? toClientSubmission(missedSubmission) : null,
      });
    }

    const answerText = String(req.body.answer || req.body.answerText || '').trim();
    const normalizedPath = String(req.file.filename || '').trim();
    const isPdfUpload = String(req.file.originalname || '').toLowerCase().endsWith('.pdf');

    let submission = await findExistingSubmission();

    if (submission) {
      const existingSubmission = toClientSubmission(submission);
      cleanupUploadedFile(req.file?.path);

      return res.status(409).json({
        message: `Task already submitted. Current status is ${existingSubmission.status}.`,
        submission: existingSubmission,
      });
    }

    submission = await Submission.create({
      taskId,
      userId: req.user._id,
      submissionFile: normalizedPath,
      fileName: req.file.originalname,
      answer: answerText,
      submittedAt: new Date(),
    });

    res.status(201).json(toClientSubmission(submission));

    // Keep upload UX fast; run expensive extraction/AI work in the background.
    void runPostSubmissionAnalysis({
      submissionId: submission._id,
      taskDescription: task.description,
      answerText,
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      isPdfUpload,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.evaluateSubmission = async (req, res) => {
  const { marks, feedback, remarks, aiReport } = req.body;
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('taskId', 'createdBy')
      .populate('task', 'createdBy');
    if (!submission) return res.status(404).json({ message: 'Submission not found' });

    const access = await ensureSubmissionAccess(req, submission);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    if (marks !== undefined) submission.marks = marks;
    if (remarks !== undefined) submission.remarks = remarks;
    if (feedback !== undefined && remarks === undefined) submission.remarks = feedback;
    if (submission.remarks !== undefined) submission.feedback = submission.remarks;
    submission.aiReport = aiReport;
    submission.status = 'evaluated';
    submission.evaluatedBy = req.user._id;
    submission.evaluatedAt = new Date();
    submission.evaluationDetails = {
      finalMarks: typeof submission.marks === 'number' ? submission.marks : null,
      finalFeedback: String(submission.remarks || '').trim(),
      aiMarks: typeof submission.aiMarks === 'number' ? submission.aiMarks : null,
      aiFeedback: submission.aiFeedback || '',
      missingPoints: submission.missingPoints || '',
      aiReport: aiReport || submission.aiReport || { strengths: [], weaknesses: [], improvements: [] },
      evaluatedBy: req.user._id,
      evaluatedAt: submission.evaluatedAt,
    };

    await submission.save();
    res.json(toClientSubmission(submission));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateAiAssist = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('taskId', 'title description createdBy')
      .populate('task', 'title description createdBy');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (isMissedSubmission(submission)) {
      return res.status(400).json({ message: MISSED_SUBMISSION_FEEDBACK });
    }

    const taskDoc = submission.taskId || submission.task || null;
    if (!taskDoc) {
      return res.status(404).json({ message: 'Task not found for this submission' });
    }

    const isEvaluator = req.user.role === 'evaluator';
    const isTaskOwner = String(taskDoc.createdBy) === String(req.user._id);
    if (isEvaluator && !isTaskOwner) {
      return res.status(403).json({ message: 'Not authorized to evaluate this submission' });
    }

    let answerText = normalizeReadableAnswer(submission.answer);
    if (!answerText) {
      const storedPath = normalizeStoredSubmissionPath(submission);
      const canExtractFromPdf = isPdfFile(submission.fileName) || isPdfFile(storedPath);
      if (canExtractFromPdf) {
        answerText = await extractSubmissionTextFromPdf(storedPath);
        answerText = normalizeReadableAnswer(answerText);
      }
    }

    if (!answerText) {
      submission.aiMarks = null;
      submission.aiFeedback = NO_READABLE_CONTENT_MESSAGE;
      submission.missingPoints = '';
      submission.aiEvaluatedAt = new Date();
      submission.aiModel = null;
      submission.evaluationDetails = {
        ...(submission.evaluationDetails || {}),
        aiMarks: null,
        aiFeedback: NO_READABLE_CONTENT_MESSAGE,
        missingPoints: '',
      };
      await submission.save();
      return res.status(422).json({ message: NO_READABLE_CONTENT_MESSAGE });
    }

    if (!normalizeReadableAnswer(submission.answer)) {
      submission.answer = answerText;
    }

    const answerForEvaluation = answerText.slice(0, 20000);

    const aiDraft = await evaluateDetailedAnswer(taskDoc.description, answerForEvaluation);
    const aiScore =
      typeof aiDraft.score === 'number'
        ? Math.max(0, Math.min(100, Math.round(aiDraft.score)))
        : null;
    const aiReport = {
      strengths: Array.isArray(aiDraft.strengths) ? aiDraft.strengths : [],
      weaknesses: Array.isArray(aiDraft.weaknesses) ? aiDraft.weaknesses : [],
      improvements: Array.isArray(aiDraft.improvements) ? aiDraft.improvements : [],
    };

    submission.aiMarks = aiScore;
    submission.aiFeedback = String(aiDraft.summary || '').trim();
    submission.aiReport = aiReport;
    submission.aiEvaluatedAt = new Date();
    submission.aiModel = aiDraft.model;
    submission.aiRawResponse = aiDraft.raw;
    submission.evaluationDetails = {
      ...(submission.evaluationDetails || {}),
      aiMarks: aiScore,
      aiFeedback: submission.aiFeedback,
      missingPoints: submission.missingPoints || '',
      aiReport,
    };

    await submission.save();

    return res.json({
      message: 'AI draft generated successfully',
      submission: toClientSubmission(submission),
      aiDraft: {
        score: aiScore,
        summary: submission.aiFeedback,
        strengths: aiReport.strengths,
        weaknesses: aiReport.weaknesses,
        improvements: aiReport.improvements,
        model: aiDraft.model || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getSubmissionsByTask = async (req, res) => {
  try {
    const taskAccess = await ensureTaskAccess(req, req.params.taskId);
    if (taskAccess.error) {
      return res.status(taskAccess.error.status).json({ message: taskAccess.error.message });
    }

    await syncMissedSubmissions({ taskIds: [req.params.taskId] });

    const submissions = await Submission.find({
      $or: [{ taskId: req.params.taskId }, { task: req.params.taskId }]
    })
      .populate('userId', 'name email')
      .populate('student', 'name email')
      .sort('-submittedAt');
    res.json(submissions.map(toClientSubmission));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentSubmissions = async (req, res) => {
  try {
    await syncMissedSubmissions({ studentId: req.user._id });

    const submissions = await Submission.find({
      $or: [{ userId: req.user._id }, { student: req.user._id }]
    })
      .populate('taskId', 'title deadline description')
      .populate('task', 'title deadline description')
      .sort('-submittedAt');
    res.json(submissions.map(toClientSubmission));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.viewSubmissionFile = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('taskId', 'createdBy')
      .populate('task', 'createdBy')
      .populate('userId', '_id')
      .populate('student', '_id');

    const access = await ensureSubmissionAccess(req, submission);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    if (isMissedSubmission(submission)) {
      return res.status(404).json({ message: MISSED_SUBMISSION_FEEDBACK });
    }

    const resolvedPath = normalizeStoredSubmissionPath(submission);
    if (!resolvedPath || !isPathInsideUploads(resolvedPath)) {
      return res.status(400).json({ message: 'Submission file path is invalid.' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'Submission file not found.' });
    }

    res.setHeader('Content-Type', getMimeTypeForPath(resolvedPath));
    res.setHeader('Content-Disposition', `inline; filename="${submission.fileName || path.basename(resolvedPath)}"`);
    return res.sendFile(resolvedPath);
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to view submission file.' });
  }
};

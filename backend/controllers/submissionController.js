const Submission = require('../models/Submission');
const SubmissionBlob = require('../models/SubmissionBlob');
const Task = require('../models/Task');
const fs = require('fs');
const path = require('path');
const { evaluateAnswer, evaluateDetailedAnswer } = require('../utils/aiEvaluation');
const { extractPDFText, extractPDFPageCount } = require('../utils/pdfTextExtractor');
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
const AI_EVAL_MAX_CHARS = 60000;
const AI_EVAL_HEAD_CHARS = 35000;
const AI_EVAL_TAIL_CHARS = 25000;
const FILE_BACKUP_MAX_BYTES = 12 * 1024 * 1024;
const DISABLE_DB_FILE_BACKUP = ['1', 'true', 'yes'].includes(
  String(process.env.DISABLE_DB_FILE_BACKUP || '').trim().toLowerCase()
);

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
const prepareAnswerForEvaluation = (value) => {
  const text = normalizeReadableAnswer(value);
  if (!text) return '';
  if (text.length <= AI_EVAL_MAX_CHARS) return text;

  return [
    text.slice(0, AI_EVAL_HEAD_CHARS),
    '\n\n[... middle content omitted for length ...]\n\n',
    text.slice(-AI_EVAL_TAIL_CHARS),
  ].join('');
};
const looksLikeMissingContentFeedback = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return MISSING_CONTENT_FEEDBACK_PATTERNS.every((pattern) => pattern.test(text));
};
const normalizeAiReportPayload = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const toList = (entry) =>
    Array.isArray(entry)
      ? entry.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

  return {
    strengths: toList(source.strengths),
    weaknesses: toList(source.weaknesses),
    improvements: toList(source.improvements),
  };
};
const buildEvaluationDetails = (baseDetails, patch = {}) => {
  const base = baseDetails && typeof baseDetails === 'object' ? baseDetails : {};
  const next = {
    ...base,
    ...patch,
  };
  next.aiReport = normalizeAiReportPayload(next.aiReport);
  return next;
};

const normalizeMissingPoint = (value = '') => (
  String(value || '')
    .replace(/^missing points?\s*:\s*/i, '')
    .replace(/^[-*•]+\s*/, '')
    .trim()
);
const splitMissingPoints = (value = '') => (
  String(value || '')
    .split(/[;\n\r]+/)
    .map(normalizeMissingPoint)
    .filter(Boolean)
);
const dedupeMissingPoints = (items = []) => {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    for (const point of splitMissingPoints(item)) {
      const key = point.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(point);
    }
  }

  return output;
};

const appendMissingPoints = (feedbackText = '', missingPoints = '') => {
  const cleanFeedback = String(feedbackText || '').trim();
  const missingList = dedupeMissingPoints([missingPoints]);

  if (missingList.length === 0) return cleanFeedback;

  const existingInFeedback = dedupeMissingPoints([cleanFeedback]).map((point) => point.toLowerCase());
  const nextMissingList = missingList.filter((point) => !existingInFeedback.includes(point.toLowerCase()));

  if (nextMissingList.length === 0) return cleanFeedback;
  const formattedMissing = nextMissingList.join('; ');

  return cleanFeedback
    ? `${cleanFeedback}\n\nMissing Points: ${formattedMissing}`
    : `Missing Points: ${formattedMissing}`;
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

const persistSubmissionFileBackup = async ({
  submissionId,
  filePath,
  fileName,
  mimeType,
}) => {
  if (DISABLE_DB_FILE_BACKUP) return;
  if (!submissionId || !filePath) return;

  try {
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (!stats || !stats.isFile()) return;
    if (stats.size <= 0 || stats.size > FILE_BACKUP_MAX_BYTES) return;

    const fileData = fs.readFileSync(filePath);
    if (!Buffer.isBuffer(fileData) || fileData.length === 0) return;

    await SubmissionBlob.findOneAndUpdate(
      { submissionId },
      {
        $set: {
          fileData,
          fileMimeType: String(mimeType || '').trim() || getMimeTypeForPath(fileName || filePath),
          fileName: String(fileName || path.basename(filePath)).trim() || 'submission-file',
          fileSize: fileData.length,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.warn(`DB file backup failed for submission ${submissionId}: ${error.message}`);
  }
};

const sendSubmissionBlobIfAvailable = async (res, submissionDoc) => {
  try {
    const blobDoc = await SubmissionBlob.findOne({ submissionId: submissionDoc?._id })
      .select('fileData fileMimeType fileName')
      .lean();
    const payload = blobDoc?.fileData;
    if (!payload) return false;

    const fileBuffer = Buffer.isBuffer(payload)
      ? payload
      : Buffer.isBuffer(payload?.buffer)
        ? payload.buffer
        : (payload?.type === 'Buffer' && Array.isArray(payload?.data))
          ? Buffer.from(payload.data)
          : null;
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) return false;

    const safeFileName = String(
      blobDoc?.fileName || submissionDoc?.fileName || `submission-${submissionDoc?._id || 'file'}`
    ).trim();
    res.setHeader(
      'Content-Type',
      String(blobDoc?.fileMimeType || '').trim() || getMimeTypeForPath(safeFileName)
    );
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
    res.setHeader('X-Submission-Source', 'db-backup');
    res.send(fileBuffer);
    return true;
  } catch (error) {
    console.warn(`DB file backup read failed for submission ${submissionDoc?._id}: ${error.message}`);
    return false;
  }
};

const sendReadableAnswerFallback = (res, submissionDoc) => {
  const readableAnswer = normalizeReadableAnswer(submissionDoc?.answer);
  if (!readableAnswer) return false;

  const baseName = String(submissionDoc?.fileName || `submission-${submissionDoc?._id || 'answer'}`).trim();
  const fallbackName = `${path.parse(baseName).name || 'submission-answer'}-recovered.txt`;
  const fallbackText = [
    'Recovered Submission Content',
    '',
    'Original uploaded file is unavailable on server storage.',
    'Showing extracted submission text preserved in the database.',
    '',
    '----- BEGIN SUBMISSION TEXT -----',
    readableAnswer,
    '----- END SUBMISSION TEXT -----',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${fallbackName}"`);
  res.setHeader('X-Submission-Source', 'text-fallback');
  res.send(fallbackText);
  return true;
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
  taskTitle,
  taskDescription,
  rubricText,
  rubricSections,
  requiredPages,
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
      submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
        aiMarks: null,
        aiFeedback: NO_READABLE_CONTENT_MESSAGE,
        missingPoints: '',
        offTopicDetected: false,
        offTopicReason: '',
      });
      await submission.save();
      return;
    }

    const answerForEvaluation = prepareAnswerForEvaluation(derivedAnswer);
    const aiResult = await evaluateAnswer(taskDescription, answerForEvaluation, {
      title: taskTitle,
      rubricText,
      rubricSections,
      requiredPages,
    });

    submission.aiMarks = aiResult.marks;
    submission.aiFeedback = aiResult.feedback;
    submission.missingPoints = aiResult.missingPoints;
    submission.aiEvaluatedAt = new Date();
    submission.aiModel = aiResult.model;
    submission.aiRawResponse = aiResult.raw;
    submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
      aiMarks: aiResult.marks,
      aiRawMarks: typeof aiResult.rawMarks === 'number' ? aiResult.rawMarks : null,
      structureScore: typeof aiResult.structureScore === 'number' ? aiResult.structureScore : null,
      aiFeedback: aiResult.feedback,
      missingPoints: aiResult.missingPoints,
      offTopicDetected: Boolean(aiResult.isOffTopic),
      offTopicReason: String(aiResult.offTopicReason || '').trim(),
      sectionAnalysis: Array.isArray(aiResult.sectionAnalysis) ? aiResult.sectionAnalysis : [],
    });

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
    allowResubmission: Boolean(item.allowResubmission),
    reopenReason: item.reopenReason || '',
    reopenedAt: item.reopenedAt || null,
    reopenedBy: item.reopenedBy || null,
    resubmissionCount: Number(item.resubmissionCount || 0),

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

  const candidateRoots = Array.from(new Set([
    uploadRoot,
    path.resolve(__dirname, '..', 'uploads'),
    path.resolve(process.cwd(), 'uploads'),
    '/app/uploads',
    '/var/data/dtep-uploads',
  ]));
  const normalizedRelativePath = rawPath
    .replace(/^uploads[\\/]+/i, '')
    .replace(/^backend[\\/]uploads[\\/]+/i, '');

  if (path.isAbsolute(rawPath)) {
    const absolutePath = path.normalize(rawPath);
    if (fs.existsSync(absolutePath)) {
      return absolutePath;
    }

    const basename = path.basename(absolutePath);
    for (const rootPath of candidateRoots) {
      const candidate = path.resolve(rootPath, basename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  const legacyResolvedPath = path.resolve(__dirname, '..', rawPath);
  if (fs.existsSync(legacyResolvedPath)) {
    return legacyResolvedPath;
  }

  for (const rootPath of candidateRoots) {
    const candidate = path.resolve(rootPath, normalizedRelativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

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

    const answerText = String(req.body.answer || req.body.answerText || '').trim();
    const normalizedPath = String(req.file.filename || '').trim();
    const isPdfUpload = String(req.file.originalname || '').toLowerCase().endsWith('.pdf');
    const requiredPages = Math.max(0, Math.trunc(Number(task.requiredPages || 0)));

    if (requiredPages > 0) {
      if (!isPdfUpload) {
        cleanupUploadedFile(req.file?.path);
        return res.status(400).json({
          message: `This assignment requires at least ${requiredPages} pages. Upload a PDF so pages can be validated.`,
        });
      }

      let uploadedPageCount = null;
      try {
        uploadedPageCount = await extractPDFPageCount(req.file.path);
      } catch (_) {
        uploadedPageCount = null;
      }

      if (!Number.isFinite(uploadedPageCount) || uploadedPageCount === null) {
        cleanupUploadedFile(req.file?.path);
        return res.status(400).json({
          message: 'Could not validate PDF page count. Please upload a readable PDF document.',
        });
      }

      if (uploadedPageCount < requiredPages) {
        cleanupUploadedFile(req.file?.path);
        return res.status(400).json({
          message: `Page count is below requirement: minimum ${requiredPages} pages, but received ${uploadedPageCount} pages.`,
        });
      }
    }

    let submission = await findExistingSubmission();
    const canReplaceExistingSubmission = Boolean(submission?.allowResubmission);
    const isDeadlinePassed = new Date(task.deadline).getTime() < Date.now();

    if (isDeadlinePassed && !canReplaceExistingSubmission) {
      await syncMissedSubmissions({ taskIds: [taskId], studentId: req.user._id });
      const existingSubmission = submission || await findExistingSubmission();
      cleanupUploadedFile(req.file?.path);

      if (existingSubmission) {
        return res.status(409).json({
          message: `Task already submitted. Current status is ${existingSubmission.status || 'pending'}.`,
          submission: toClientSubmission(existingSubmission),
        });
      }

      return res.status(409).json({
        message: 'Deadline has passed. This assignment was auto-marked 0 for non-submission.',
        submission: null,
      });
    }

    if (submission && canReplaceExistingSubmission) {
      const previousFilePath = normalizeStoredSubmissionPath(submission);
      const previousWasAutoZero = isMissedSubmission(submission);
      const reopenedAt = submission.reopenedAt || null;
      const reopenedBy = submission.reopenedBy || null;
      const reopenReason = String(submission.reopenReason || '').trim();

      submission.submissionFile = normalizedPath;
      submission.fileUrl = normalizedPath;
      submission.fileName = req.file.originalname;
      submission.answer = answerText;
      submission.submittedAt = new Date();
      submission.status = 'pending';
      submission.isAutoZero = false;
      submission.allowResubmission = false;
      submission.reopenReason = '';
      submission.reopenedAt = null;
      submission.reopenedBy = null;
      submission.marks = null;
      submission.remarks = '';
      submission.feedback = '';
      submission.evaluatedBy = null;
      submission.evaluatedAt = null;
      submission.aiMarks = null;
      submission.aiFeedback = '';
      submission.missingPoints = '';
      submission.aiEvaluatedAt = null;
      submission.aiModel = null;
      submission.aiRawResponse = null;
      submission.aiReport = {
        strengths: [],
        weaknesses: [],
        improvements: [],
      };
      submission.resubmissionCount = Number(submission.resubmissionCount || 0) + 1;
      submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
        finalMarks: null,
        finalFeedback: '',
        aiMarks: null,
        aiFeedback: '',
        missingPoints: '',
        offTopicDetected: false,
        offTopicReason: '',
        reopenedForResubmissionAt: reopenedAt,
        reopenedForResubmissionBy: reopenedBy,
        reopenedForResubmissionReason: reopenReason,
        lastResubmittedAt: submission.submittedAt,
        resubmissionCount: submission.resubmissionCount,
      });

      await submission.save();
      await persistSubmissionFileBackup({
        submissionId: submission._id,
        filePath: req.file.path,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      if (previousFilePath && !previousWasAutoZero) {
        cleanupUploadedFile(previousFilePath);
      }

      void runPostSubmissionAnalysis({
        submissionId: submission._id,
        taskTitle: task.title,
        taskDescription: task.description,
        rubricText: task.rubricText,
        rubricSections: task.rubricSections,
        requiredPages: Number(task.requiredPages || 0),
        answerText,
        filePath: req.file.path,
        originalFileName: req.file.originalname,
        isPdfUpload,
      });

      return res.status(200).json({
        message: 'Resubmission uploaded successfully.',
        submission: toClientSubmission(submission),
      });
    }

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
    await persistSubmissionFileBackup({
      submissionId: submission._id,
      filePath: req.file.path,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    res.status(201).json(toClientSubmission(submission));

    // Keep upload UX fast; run expensive extraction/AI work in the background.
    void runPostSubmissionAnalysis({
      submissionId: submission._id,
      taskTitle: task.title,
      taskDescription: task.description,
      rubricText: task.rubricText,
      rubricSections: task.rubricSections,
      requiredPages: Number(task.requiredPages || 0),
      answerText,
      filePath: req.file.path,
      originalFileName: req.file.originalname,
      isPdfUpload,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reopenSubmission = async (req, res) => {
  try {
    const reopenReason = String(req.body.reason || req.body.message || '').trim();

    const submission = await Submission.findById(req.params.id)
      .populate('taskId', 'createdBy')
      .populate('task', 'createdBy');
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const access = await ensureSubmissionAccess(req, submission);
    if (access.error) {
      return res.status(access.error.status).json({ message: access.error.message });
    }

    const wasOpen = Boolean(submission.allowResubmission);
    submission.allowResubmission = true;
    submission.reopenReason = reopenReason;
    submission.reopenedAt = new Date();
    submission.reopenedBy = req.user._id;
    submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
      reopenedForResubmission: true,
      reopenedForResubmissionAt: submission.reopenedAt,
      reopenedForResubmissionBy: req.user._id,
      reopenedForResubmissionReason: reopenReason,
    });

    await submission.save();

    return res.json({
      message: wasOpen
        ? 'Resubmission window already open. Details updated.'
        : 'Resubmission window opened for this student.',
      submission: toClientSubmission(submission),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to reopen submission.' });
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
    const offTopicDetected = Boolean(submission?.evaluationDetails?.offTopicDetected);
    if (offTopicDetected) {
      submission.marks = 0;
    }
    const normalizedAiReport = normalizeAiReportPayload(aiReport ?? submission.aiReport);
    submission.aiReport = normalizedAiReport;
    submission.status = 'evaluated';
    submission.evaluatedBy = req.user._id;
    submission.evaluatedAt = new Date();
    submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
      finalMarks: typeof submission.marks === 'number' ? submission.marks : null,
      finalFeedback: String(submission.remarks || '').trim(),
      aiMarks: typeof submission.aiMarks === 'number' ? submission.aiMarks : null,
      aiFeedback: submission.aiFeedback || '',
      missingPoints: submission.missingPoints || '',
      offTopicDetected,
      offTopicReason: String(submission?.evaluationDetails?.offTopicReason || '').trim(),
      aiReport: normalizedAiReport,
      evaluatedBy: req.user._id,
      evaluatedAt: submission.evaluatedAt,
    });

    await submission.save();
    res.json(toClientSubmission(submission));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateAiAssist = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('taskId', 'title description createdBy rubricText rubricSections requiredPages')
      .populate('task', 'title description createdBy rubricText rubricSections requiredPages');

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
      submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
        aiMarks: null,
        aiFeedback: NO_READABLE_CONTENT_MESSAGE,
        missingPoints: '',
        offTopicDetected: false,
        offTopicReason: '',
      });
      await submission.save();
      return res.status(422).json({ message: NO_READABLE_CONTENT_MESSAGE });
    }

    if (!normalizeReadableAnswer(submission.answer)) {
      submission.answer = answerText;
    }

    const answerForEvaluation = prepareAnswerForEvaluation(answerText);

    const aiDraft = await evaluateDetailedAnswer(taskDoc.description, answerForEvaluation, {
      title: taskDoc.title,
      rubricText: taskDoc.rubricText,
      rubricSections: taskDoc.rubricSections,
      requiredPages: Number(taskDoc.requiredPages || 0),
    });
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
    submission.evaluationDetails = buildEvaluationDetails(submission.evaluationDetails, {
      aiMarks: aiScore,
      aiRawMarks: typeof aiDraft.rawScore === 'number' ? aiDraft.rawScore : null,
      structureScore: typeof aiDraft.structureScore === 'number' ? aiDraft.structureScore : null,
      aiFeedback: submission.aiFeedback,
      missingPoints: submission.missingPoints || '',
      offTopicDetected: Boolean(aiDraft.isOffTopic),
      offTopicReason: String(aiDraft.offTopicReason || '').trim(),
      aiReport,
      sectionAnalysis: Array.isArray(aiDraft.sectionAnalysis) ? aiDraft.sectionAnalysis : [],
    });

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
    const canReadFromDisk = Boolean(resolvedPath && isPathInsideUploads(resolvedPath) && fs.existsSync(resolvedPath));
    if (canReadFromDisk) {
      res.setHeader('Content-Type', getMimeTypeForPath(resolvedPath));
      res.setHeader('Content-Disposition', `inline; filename="${submission.fileName || path.basename(resolvedPath)}"`);
      return res.sendFile(resolvedPath);
    }

    if (await sendSubmissionBlobIfAvailable(res, submission)) {
      return;
    }

    if (sendReadableAnswerFallback(res, submission)) {
      return;
    }

    return res.status(404).json({
      message: 'Submission file not found on server storage. Re-upload may be required after redeploy if uploads were on ephemeral disk.',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to view submission file.' });
  }
};

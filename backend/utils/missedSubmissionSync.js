const Submission = require('../models/Submission');
const Task = require('../models/Task');
const User = require('../models/User');

const MISSED_SUBMISSION_FILE = '__missing_submission__';
const MISSED_SUBMISSION_FILENAME = 'not-submitted.txt';
const MISSED_SUBMISSION_FEEDBACK = 'Auto-assigned 0 marks because the assignment was not submitted before the deadline.';

const toObjectIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const normalizeIdList = (values = []) => (
  Array.from(new Set(values.map((value) => toObjectIdString(value).trim()).filter(Boolean)))
);

const buildSubmissionKey = (taskId, studentId) => `${toObjectIdString(taskId)}:${toObjectIdString(studentId)}`;

const isMissedSubmission = (submissionDoc) => (
  Boolean(submissionDoc?.isAutoZero) ||
  String(submissionDoc?.submissionFile || submissionDoc?.fileUrl || '').trim() === MISSED_SUBMISSION_FILE
);

const buildMissedSubmissionDoc = (taskId, studentId, deadline) => {
  const evaluatedAt = deadline instanceof Date ? deadline : new Date(deadline);

  return {
    taskId,
    task: taskId,
    userId: studentId,
    student: studentId,
    submissionFile: MISSED_SUBMISSION_FILE,
    fileUrl: MISSED_SUBMISSION_FILE,
    fileName: MISSED_SUBMISSION_FILENAME,
    answer: '',
    submittedAt: evaluatedAt,
    remarks: MISSED_SUBMISSION_FEEDBACK,
    feedback: MISSED_SUBMISSION_FEEDBACK,
    marks: 0,
    aiMarks: 0,
    aiFeedback: '',
    missingPoints: '',
    evaluatedAt,
    status: 'evaluated',
    isAutoZero: true,
    aiReport: {
      strengths: [],
      weaknesses: ['Assignment was not submitted before the deadline.'],
      improvements: ['Submit the assignment before the deadline to avoid an automatic zero.'],
    },
    evaluationDetails: {
      finalMarks: 0,
      finalFeedback: MISSED_SUBMISSION_FEEDBACK,
      aiMarks: 0,
      aiFeedback: '',
      missingPoints: '',
      aiReport: {
        strengths: [],
        weaknesses: ['Assignment was not submitted before the deadline.'],
        improvements: ['Submit the assignment before the deadline to avoid an automatic zero.'],
      },
      evaluatedBy: null,
      evaluatedAt,
    },
  };
};

const syncMissedSubmissions = async ({ taskIds = [], studentId = null, createdBy = null } = {}) => {
  const now = new Date();
  const normalizedTaskIds = normalizeIdList(taskIds);
  const normalizedStudentId = toObjectIdString(studentId).trim();
  const normalizedOwnerId = toObjectIdString(createdBy).trim();

  const taskFilter = { deadline: { $lt: now } };
  if (normalizedTaskIds.length > 0) {
    taskFilter._id = { $in: normalizedTaskIds };
  }
  if (normalizedOwnerId) {
    taskFilter.createdBy = normalizedOwnerId;
  }

  const tasks = await Task.find(taskFilter).select('_id deadline').lean();
  if (tasks.length === 0) {
    return { createdCount: 0 };
  }

  const students = normalizedStudentId
    ? [{ _id: normalizedStudentId }]
    : await User.find({ role: 'student' }).select('_id').lean();

  if (students.length === 0) {
    return { createdCount: 0 };
  }

  const overdueTaskIds = tasks.map((task) => task._id);
  const studentIds = students.map((student) => student._id);
  const existingSubmissions = await Submission.find({
    $or: [
      { taskId: { $in: overdueTaskIds }, userId: { $in: studentIds } },
      { task: { $in: overdueTaskIds }, student: { $in: studentIds } },
    ],
  }).select('taskId task userId student').lean();

  const existingKeys = new Set(
    existingSubmissions.map((submission) => buildSubmissionKey(
      submission.taskId || submission.task,
      submission.userId || submission.student
    ))
  );

  const docsToInsert = [];
  for (const task of tasks) {
    for (const student of students) {
      const key = buildSubmissionKey(task._id, student._id);
      if (existingKeys.has(key)) continue;

      docsToInsert.push(buildMissedSubmissionDoc(task._id, student._id, task.deadline));
      existingKeys.add(key);
    }
  }

  if (docsToInsert.length === 0) {
    return { createdCount: 0 };
  }

  try {
    await Submission.insertMany(docsToInsert, { ordered: false });
    return { createdCount: docsToInsert.length };
  } catch (error) {
    const duplicateOnly = Array.isArray(error?.writeErrors) && error.writeErrors.every((item) => item.code === 11000);
    if (duplicateOnly) {
      return { createdCount: 0 };
    }

    throw error;
  }
};

module.exports = {
  MISSED_SUBMISSION_FILE,
  MISSED_SUBMISSION_FILENAME,
  MISSED_SUBMISSION_FEEDBACK,
  isMissedSubmission,
  syncMissedSubmissions,
};

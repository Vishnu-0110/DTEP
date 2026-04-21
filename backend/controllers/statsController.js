const User = require('../models/User');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const { syncMissedSubmissions } = require('../utils/missedSubmissionSync');

const andMatch = (...parts) => {
  const validParts = parts.filter(Boolean);
  if (validParts.length === 0) return {};
  if (validParts.length === 1) return validParts[0];
  return { $and: validParts };
};

const taskSubmissionMatch = (taskIds) => ({
  $or: [{ taskId: { $in: taskIds } }, { task: { $in: taskIds } }]
});

const studentSubmissionMatch = (studentId) => ({
  $or: [{ userId: studentId }, { student: studentId }]
});

const evaluatedSubmissionFilter = {
  $or: [
    { status: 'evaluated' },
    { evaluatedAt: { $exists: true, $ne: null } },
    { marks: { $type: 'number' } }
  ]
};

const actualSubmissionFilter = {
  $or: [
    { isAutoZero: { $exists: false } },
    { isAutoZero: false }
  ]
};

const autoZeroFilter = { isAutoZero: true };

const toTaskIdString = (submissionDoc) => String(submissionDoc?.taskId || submissionDoc?.task || '').trim();

const buildStatusChart = (items) => items.map((item) => ({
  name: item.name,
  count: Math.max(0, Number(item.count) || 0),
  tone: item.tone,
}));

exports.getSummary = async (req, res) => {
  try {
    const role = req.user.role;
    const now = new Date();

    if (role === 'admin') {
      await syncMissedSubmissions();

      const [
        totalUsers,
        totalAdmins,
        totalEvaluators,
        totalStudents,
        totalTasks,
        openTasks,
        totalSubmissions,
        pendingSubmissions,
        evaluatedSubmissions,
        missedSubmissions
      ] = await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: 'admin' }),
        User.countDocuments({ role: 'evaluator' }),
        User.countDocuments({ role: 'student' }),
        Task.countDocuments({}),
        Task.countDocuments({ deadline: { $gte: now } }),
        Submission.countDocuments(actualSubmissionFilter),
        Submission.countDocuments(andMatch(actualSubmissionFilter, { status: 'pending' })),
        Submission.countDocuments(andMatch(actualSubmissionFilter, evaluatedSubmissionFilter)),
        Submission.countDocuments(autoZeroFilter)
      ]);

      return res.json({
        role,
        totals: {
          totalUsers,
          totalAdmins,
          totalEvaluators,
          totalStudents,
          totalTasks,
          totalSubmissions,
          pendingSubmissions,
          evaluatedSubmissions,
          missedSubmissions
        },
        chart: buildStatusChart([
          { name: 'Open', count: openTasks, tone: 'open' },
          { name: 'Pending', count: pendingSubmissions, tone: 'pending' },
          { name: 'Reviewed', count: evaluatedSubmissions, tone: 'reviewed' },
          { name: 'Missed', count: missedSubmissions, tone: 'missed' }
        ])
      });
    }

    if (role === 'evaluator') {
      await syncMissedSubmissions({ createdBy: req.user._id });

      const tasks = await Task.find({ createdBy: req.user._id }).select('_id deadline').lean();
      const taskIds = tasks.map((task) => task._id);
      const match = taskIds.length > 0 ? taskSubmissionMatch(taskIds) : null;
      const openTasks = tasks.filter((task) => new Date(task.deadline).getTime() >= now.getTime()).length;

      const [
        submissionsTotal,
        pendingSubmissions,
        evaluatedSubmissions,
        missedSubmissions
      ] = match ? await Promise.all([
        Submission.countDocuments(andMatch(match, actualSubmissionFilter)),
        Submission.countDocuments(andMatch(match, actualSubmissionFilter, { status: 'pending' })),
        Submission.countDocuments(andMatch(match, actualSubmissionFilter, evaluatedSubmissionFilter)),
        Submission.countDocuments(andMatch(match, autoZeroFilter))
      ]) : [0, 0, 0, 0];

      return res.json({
        role,
        totals: {
          tasksCreated: tasks.length,
          openTasks,
          submissionsTotal,
          pendingSubmissions,
          evaluatedSubmissions,
          missedSubmissions
        },
        chart: buildStatusChart([
          { name: 'Open', count: openTasks, tone: 'open' },
          { name: 'Pending', count: pendingSubmissions, tone: 'pending' },
          { name: 'Reviewed', count: evaluatedSubmissions, tone: 'reviewed' },
          { name: 'Missed', count: missedSubmissions, tone: 'missed' }
        ])
      });
    }

    if (role === 'student') {
      await syncMissedSubmissions({ studentId: req.user._id });

      const match = studentSubmissionMatch(req.user._id);
      const [tasks, submissions, avgMarksAgg] = await Promise.all([
        Task.find({}).sort({ deadline: 1 }).select('_id deadline title').lean(),
        Submission.find(match)
          .select('taskId task status marks evaluatedAt isAutoZero')
          .lean(),
        Submission.aggregate([
          { $match: andMatch(match, { marks: { $type: 'number' } }) },
          { $group: { _id: null, avg: { $avg: '$marks' } } }
        ])
      ]);

      const submissionsByTask = new Map();
      for (const submission of submissions) {
        const taskId = toTaskIdString(submission);
        if (taskId && !submissionsByTask.has(taskId)) {
          submissionsByTask.set(taskId, submission);
        }
      }

      let openTasks = 0;
      let mySubmissions = 0;
      let myPending = 0;
      let myEvaluated = 0;
      let missedTasks = 0;

      for (const task of tasks) {
        const taskId = String(task._id);
        const submission = submissionsByTask.get(taskId);
        const deadlineMs = new Date(task.deadline).getTime();
        const isFutureTask = Number.isFinite(deadlineMs) && deadlineMs >= now.getTime();

        if (!submission) {
          if (isFutureTask) {
            openTasks += 1;
          } else {
            missedTasks += 1;
          }
          continue;
        }

        if (submission.isAutoZero) {
          missedTasks += 1;
          continue;
        }

        mySubmissions += 1;
        const isEvaluated =
          submission.status === 'evaluated' ||
          Boolean(submission.evaluatedAt) ||
          typeof submission.marks === 'number';

        if (isEvaluated) {
          myEvaluated += 1;
        } else {
          myPending += 1;
        }
      }

      const nextTask = tasks.find((task) => {
        const deadlineMs = new Date(task.deadline).getTime();
        return Number.isFinite(deadlineMs) &&
          deadlineMs >= now.getTime() &&
          !submissionsByTask.has(String(task._id));
      }) || null;

      const avgMarks = avgMarksAgg[0]?.avg ?? null;

      return res.json({
        role,
        totals: {
          tasksAvailable: openTasks,
          totalAssignedTasks: tasks.length,
          mySubmissions,
          myPending,
          myEvaluated,
          missedTasks,
          avgMarks,
          nextDeadline: nextTask?.deadline || null,
          nextDeadlineTitle: nextTask?.title || null
        },
        chart: buildStatusChart([
          { name: 'Open', count: openTasks, tone: 'open' },
          { name: 'Pending', count: myPending, tone: 'pending' },
          { name: 'Reviewed', count: myEvaluated, tone: 'reviewed' },
          { name: 'Missed', count: missedTasks, tone: 'missed' }
        ])
      });
    }

    return res.status(403).json({ message: 'Role not supported for dashboard stats.' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load dashboard stats.' });
  }
};

const Task = require('../models/Task');
const Submission = require('../models/Submission');
const SystemSetting = require('../models/SystemSetting');

const GLOBAL_KEY = 'global';

const parseDateQuery = (rawValue) => {
  if (!rawValue) return null;
  const parsed = new Date(String(rawValue));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const toMaintenancePayload = (settingDoc) => {
  const enabled = Boolean(settingDoc?.maintenanceMode);
  const rawMessage = String(settingDoc?.maintenanceMessage || '').trim();

  return {
    enabled,
    message: enabled ? (rawMessage || 'The platform is currently under maintenance.') : rawMessage,
    updatedAt: settingDoc?.updatedAt || null,
  };
};

const toMaintenanceEvent = (maintenanceStatus, sinceMaintenanceAt) => {
  if (!maintenanceStatus?.updatedAt) return null;

  const changedAt = new Date(maintenanceStatus.updatedAt);
  const shouldEmitEvent = !sinceMaintenanceAt || changedAt > sinceMaintenanceAt;

  if (!shouldEmitEvent) return null;

  if (maintenanceStatus.enabled) {
    return maintenanceStatus;
  }

  return {
    ...maintenanceStatus,
    message: maintenanceStatus.message || 'Maintenance has ended.'
  };
};

const toObjectIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

exports.getMaintenanceStatus = async (req, res) => {
  try {
    const setting = await SystemSetting.findOne({ key: GLOBAL_KEY }).select('maintenanceMode maintenanceMessage updatedAt');
    return res.json(toMaintenancePayload(setting));
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load maintenance status.' });
  }
};

exports.updateMaintenanceStatus = async (req, res) => {
  try {
    if (req.body.enabled === undefined) {
      return res.status(400).json({ message: 'Field "enabled" is required.' });
    }

    const enabled = req.body.enabled === true || String(req.body.enabled).toLowerCase() === 'true';
    const message = String(req.body.message || '').trim();
    const updatedAt = new Date();

    const setting = await SystemSetting.findOneAndUpdate(
      { key: GLOBAL_KEY },
      {
        $set: {
          maintenanceMode: enabled,
          maintenanceMessage: message,
          updatedBy: req.user?._id || null,
          updatedAt,
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).select('maintenanceMode maintenanceMessage updatedAt');

    return res.json(toMaintenancePayload(setting));
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to update maintenance status.' });
  }
};

exports.getStudentNotifications = async (req, res) => {
  try {
    const sinceTaskAt = parseDateQuery(req.query.sinceTaskAt);
    const sinceMaintenanceAt = parseDateQuery(req.query.sinceMaintenanceAt);

    const taskFilter = sinceTaskAt ? { createdAt: { $gt: sinceTaskAt } } : {};
    const newTasks = await Task.find(taskFilter)
      .sort('-createdAt')
      .limit(20)
      .lean()
      .select('_id title deadline createdAt');

    const setting = await SystemSetting.findOne({ key: GLOBAL_KEY }).select('maintenanceMode maintenanceMessage updatedAt');
    const maintenanceStatus = toMaintenancePayload(setting);
    const maintenanceEvent = toMaintenanceEvent(maintenanceStatus, sinceMaintenanceAt);

    return res.json({
      newTasks,
      latestTaskAt: newTasks[0]?.createdAt || sinceTaskAt || null,
      maintenanceStatus,
      maintenanceEvent
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch student notifications.' });
  }
};

exports.getEvaluatorNotifications = async (req, res) => {
  try {
    const sinceSubmissionAt = parseDateQuery(req.query.sinceSubmissionAt);
    const sinceMaintenanceAt = parseDateQuery(req.query.sinceMaintenanceAt);

    const ownedTasks = await Task.find({ createdBy: req.user._id })
      .sort('-createdAt')
      .select('_id title')
      .lean();

    const ownedTaskIds = ownedTasks.map((task) => task._id);
    const taskTitleMap = new Map(
      ownedTasks.map((task) => [String(task._id), String(task.title || 'Assigned task')])
    );

    let newSubmissions = [];

    if (ownedTaskIds.length > 0) {
      const submissionFilter = {
        $or: [
          { taskId: { $in: ownedTaskIds } },
          { task: { $in: ownedTaskIds } }
        ]
      };

      if (sinceSubmissionAt) {
        submissionFilter.submittedAt = { $gt: sinceSubmissionAt };
      }

      const submissionDocs = await Submission.find(submissionFilter)
        .sort('-submittedAt')
        .limit(20)
        .populate('userId', 'name')
        .populate('student', 'name')
        .lean()
        .select('_id taskId task userId student submittedAt');

      newSubmissions = submissionDocs.map((submission) => {
        const normalizedTaskId = toObjectIdString(submission.taskId || submission.task);
        const normalizedSubmissionId = String(submission._id);
        const studentName = String(submission.userId?.name || submission.student?.name || 'A student');

        return {
          _id: normalizedSubmissionId,
          submissionId: normalizedSubmissionId,
          taskId: normalizedTaskId,
          taskTitle: taskTitleMap.get(normalizedTaskId) || 'Assigned task',
          studentName,
          submittedAt: submission.submittedAt || null
        };
      });
    }

    const setting = await SystemSetting.findOne({ key: GLOBAL_KEY }).select('maintenanceMode maintenanceMessage updatedAt');
    const maintenanceStatus = toMaintenancePayload(setting);
    const maintenanceEvent = toMaintenanceEvent(maintenanceStatus, sinceMaintenanceAt);

    return res.json({
      newSubmissions,
      latestSubmissionAt: newSubmissions[0]?.submittedAt || sinceSubmissionAt || null,
      maintenanceStatus,
      maintenanceEvent
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to fetch evaluator notifications.' });
  }
};

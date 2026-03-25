const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { syncMissedSubmissions } = require('../utils/missedSubmissionSync');
const { generateAssignmentRubric } = require('../utils/aiEvaluation');

const buildFallbackRubricText = ({ title, requiredPages }) => {
  const pageLine = requiredPages > 0
    ? `Submit exactly ${requiredPages} pages in PDF format.`
    : 'Submit a complete assignment with clear structure and relevant sources.';

  return [
    `Assignment focus: ${title}.`,
    'Use clear headings and provide accurate, topic-focused explanations.',
    'Include: Topic, Introduction, Types/Categories, Explanation of Concepts, Examples, Applications, Advantages and Disadvantages, Conclusion, References.',
    pageLine,
    'Use reliable academic references (textbooks, peer-reviewed journals, official educational sites).',
  ].join('\n');
};

exports.createTask = async (req, res) => {
  const normalizeText = (value, max = 6000) => String(value || '').trim().slice(0, max);
  const title = normalizeText(req.body?.title, 180);
  const description = normalizeText(req.body?.description, 6000);
  const rawDeadline = String(req.body?.deadline || '').trim();
  const deadline = new Date(rawDeadline);
  const rawRequiredPages = req.body?.requiredPages;
  const normalizedRequiredPages = String(rawRequiredPages ?? '').trim();
  const hasRequiredPages = normalizedRequiredPages.length > 0;
  const requiredPages = hasRequiredPages ? Number(normalizedRequiredPages) : 0;

  if (!title || !description || !rawDeadline || !Number.isFinite(deadline.getTime())) {
    return res.status(400).json({ message: 'title, description, and a valid deadline are required.' });
  }

  if (hasRequiredPages) {
    const isValidRequiredPages =
      Number.isFinite(requiredPages) &&
      Number.isInteger(requiredPages) &&
      requiredPages > 0 &&
      requiredPages <= 500;
    if (!isValidRequiredPages) {
      return res.status(400).json({ message: 'requiredPages must be a whole number between 1 and 500.' });
    }
  }

  try {
    const fallbackRubricText = buildFallbackRubricText({
      title,
      requiredPages: Math.trunc(requiredPages),
    });

    const task = await Task.create({
      title,
      description,
      deadline,
      requiredPages: Math.trunc(requiredPages),
      rubricText: fallbackRubricText,
      rubricModel: 'template',
      rubricGeneratedAt: new Date(),
      createdBy: req.user._id,
    });

    res.status(201).json(task);

    void (async () => {
      try {
        const rubric = await generateAssignmentRubric({
          title,
          description,
          requiredPages: Math.trunc(requiredPages),
        });
        const rubricText = String(rubric?.rubricText || '').trim();
        if (!rubricText) return;

        await Task.findByIdAndUpdate(task._id, {
          $set: {
            rubricText,
            rubricModel: String(rubric?.model || 'gemini').trim(),
            rubricGeneratedAt: new Date(),
          },
        });
      } catch (_) {
        // Keep fallback rubric when AI generation is unavailable.
      }
    })();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    if (req.user?.role === 'student') {
      await syncMissedSubmissions({ studentId: req.user._id });
    }

    if (req.user?.role === 'evaluator') {
      await syncMissedSubmissions({ createdBy: req.user._id });
    }

    const filter = req.user?.role === 'evaluator' ? { createdBy: req.user._id } : {};
    const tasks = await Task.find(filter)
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .lean();

    if (req.user?.role !== 'evaluator' || tasks.length === 0) {
      return res.json(tasks);
    }

    const taskIds = tasks.map((task) => task._id);
    const [totalStudents, submissionCounts] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Submission.aggregate([
        {
          $match: {
            $or: [
              { taskId: { $in: taskIds } },
              { task: { $in: taskIds } }
            ]
          }
        },
        {
          $project: {
            taskRef: { $ifNull: ['$taskId', '$task'] },
            studentRef: { $ifNull: ['$userId', '$student'] }
          }
        },
        {
          $group: {
            _id: {
              taskRef: '$taskRef',
              studentRef: '$studentRef'
            }
          }
        },
        {
          $group: {
            _id: '$_id.taskRef',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const submissionCountByTask = new Map(
      submissionCounts.map((item) => [String(item._id), item.count])
    );

    const tasksWithStats = tasks.map((task) => ({
      ...task,
      submissions: submissionCountByTask.get(String(task._id)) || 0,
      total: totalStudents,
    }));

    return res.json(tasksWithStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id).populate('createdBy', 'name');
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user?.role === 'evaluator' && String(task.createdBy?._id || task.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized to access this task' });
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = String(task.createdBy) === String(req.user._id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Not authorized to delete this task' });
    }

    await Submission.deleteMany({
      $or: [{ taskId: task._id }, { task: task._id }]
    });
    await task.deleteOne();

    res.json({ message: 'Task and related submissions deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

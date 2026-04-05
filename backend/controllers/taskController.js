const Task = require('../models/Task');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { syncMissedSubmissions } = require('../utils/missedSubmissionSync');
const { generateAssignmentRubric, buildFallbackRubricFromTopic } = require('../utils/aiEvaluation');

const extractLabeledLine = (text = '', label = '') => {
  const source = String(text || '');
  const targetLabel = String(label || '').trim();
  if (!source || !targetLabel) return '';

  const escapedLabel = targetLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedLabel}\\s*:\\s*([^\\n\\r]+)`, 'i'));
  if (!match?.[1]) return '';

  const value = String(match[1] || '').replace(/\.\s*$/, '').trim();
  if (!value) return '';
  return `${targetLabel}: ${value}.`;
};

const toDisplayRubricSection = (section = {}, index = 0) => {
  const label = String(section?.label || section?.name || section?.title || '').trim();
  if (!label) return null;

  const maxMarks = Number.isFinite(Number(section?.maxMarks))
    ? Math.max(1, Math.trunc(Number(section.maxMarks)))
    : 10;
  const required = section?.required !== false;
  const minWords = Number.isFinite(Number(section?.minWords))
    ? Math.max(0, Math.trunc(Number(section.minWords)))
    : 220;

  return {
    key: String(section?.key || `section_${index + 1}`).trim(),
    label,
    maxMarks,
    required,
    minWords,
  };
};

const buildDetailedRubricText = ({ rubricSections = [], requiredPages = 0, sourceRubricText = '' }) => {
  const normalizedSections = (Array.isArray(rubricSections) ? rubricSections : [])
    .map((section, index) => toDisplayRubricSection(section, index))
    .filter(Boolean);

  if (normalizedSections.length === 0) {
    return String(sourceRubricText || '').trim();
  }

  const total = normalizedSections.reduce((sum, section) => sum + section.maxMarks, 0);
  const normalizedRequiredPages = Number.isFinite(Number(requiredPages))
    ? Math.max(0, Math.trunc(Number(requiredPages)))
    : 0;

  const lines = [
    'Topic-Specific Evaluation Rubric:',
    ...normalizedSections.map((section) => (
      `- ${section.label} = ${section.maxMarks} marks (${section.required ? 'Required' : 'Optional'}, target ${section.minWords}+ words)`
    )),
    total > 0 ? `Total = ${total} marks (scaled to 100 in final score).` : '',
    normalizedRequiredPages > 0 ? `Minimum length: ${normalizedRequiredPages} page(s).` : '',
  ].map((line) => String(line || '').trim()).filter(Boolean);

  const qualityLine = extractLabeledLine(sourceRubricText, 'Quality checks');
  const referencesLine = extractLabeledLine(sourceRubricText, 'Suggested references');

  if (qualityLine) lines.push(qualityLine);
  if (referencesLine) lines.push(referencesLine);

  return lines.join('\n');
};

const normalizeTaskForClient = (taskDocOrObject) => {
  const task = taskDocOrObject?.toObject ? taskDocOrObject.toObject() : taskDocOrObject;
  if (!task || typeof task !== 'object') return taskDocOrObject;

  const rubricSections = Array.isArray(task.rubricSections) ? task.rubricSections : [];
  const normalizedRubricText = buildDetailedRubricText({
    rubricSections,
    requiredPages: task.requiredPages,
    sourceRubricText: task.rubricText,
  });

  return {
    ...task,
    rubricText: normalizedRubricText,
  };
};

exports.createTask = async (req, res) => {
  const normalizeText = (value, max = 6000) => String(value || '').trim().slice(0, max);
  const title = normalizeText(req.body?.title, 180);
  const providedDescription = normalizeText(req.body?.description, 6000);
  const hasProvidedDescription = providedDescription.length > 0;
  const rawDeadline = String(req.body?.deadline || '').trim();
  const deadline = new Date(rawDeadline);
  const rawRequiredPages = req.body?.requiredPages;
  const normalizedRequiredPages = String(rawRequiredPages ?? '').trim();
  const hasRequiredPages = normalizedRequiredPages.length > 0;
  const requiredPages = hasRequiredPages ? Number(normalizedRequiredPages) : 0;

  if (!title || !rawDeadline || !Number.isFinite(deadline.getTime())) {
    return res.status(400).json({ message: 'title and a valid deadline are required.' });
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
    const fallbackRubric = buildFallbackRubricFromTopic({
      title,
      description: providedDescription,
      requiredPages: Math.trunc(requiredPages),
    });
    const fallbackDescription = String(fallbackRubric?.generatedDescription || '').trim();
    const resolvedDescription = hasProvidedDescription
      ? providedDescription
      : (fallbackDescription || `Prepare an academic assignment on "${title}".`);
    const fallbackRubricText = String(fallbackRubric?.rubricText || '').trim();
    const fallbackRubricSections = Array.isArray(fallbackRubric?.rubricSections)
      ? fallbackRubric.rubricSections
      : [];

    const task = await Task.create({
      title,
      description: resolvedDescription,
      deadline,
      requiredPages: Math.trunc(requiredPages),
      rubricText: fallbackRubricText,
      rubricSections: fallbackRubricSections,
      rubricModel: 'template',
      rubricGeneratedAt: new Date(),
      createdBy: req.user._id,
    });

    res.status(201).json(normalizeTaskForClient(task));

    void (async () => {
      try {
        const rubric = await generateAssignmentRubric({
          title,
          description: resolvedDescription,
          requiredPages: Math.trunc(requiredPages),
        });
        const rubricText = String(rubric?.rubricText || '').trim();
        const generatedDescription = String(rubric?.generatedDescription || '').trim();
        const rubricSections = Array.isArray(rubric?.rubricSections) ? rubric.rubricSections : [];
        if (!rubricText && !generatedDescription && rubricSections.length === 0) return;

        const updatePayload = {
          rubricModel: String(rubric?.model || 'gemini').trim(),
          rubricGeneratedAt: new Date(),
        };

        if (rubricText) {
          updatePayload.rubricText = rubricText;
        }

        if (rubricSections.length > 0) {
          updatePayload.rubricSections = rubricSections;
        }

        if (!hasProvidedDescription && generatedDescription) {
          updatePayload.description = generatedDescription;
        }

        await Task.findByIdAndUpdate(task._id, {
          $set: updatePayload,
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
    const normalizedTasks = tasks.map((task) => normalizeTaskForClient(task));

    if (req.user?.role !== 'evaluator' || normalizedTasks.length === 0) {
      return res.json(normalizedTasks);
    }

    const taskIds = normalizedTasks.map((task) => task._id);
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

    const tasksWithStats = normalizedTasks.map((task) => ({
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

    res.json(normalizeTaskForClient(task));
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

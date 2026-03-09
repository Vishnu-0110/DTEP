const mongoose = require('mongoose');

const normalizeAiReport = (value) => {
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

const submissionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  submissionFile: { type: String, required: true },
  fileName: { type: String, default: 'submission-file' },
  answer: { type: String, default: '' },
  submittedAt: { type: Date, default: Date.now },
  remarks: { type: String, default: '' },
  marks: Number,
  evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  evaluatedAt: Date,
  aiMarks: Number,
  aiFeedback: String,
  missingPoints: String,
  aiEvaluatedAt: Date,
  aiModel: String,
  aiRawResponse: String,

  // Backward compatibility fields for existing API/UI contracts.
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  fileUrl: String,
  feedback: String,
  evaluator: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'evaluated'], default: 'pending' },
  isAutoZero: { type: Boolean, default: false },
  aiReport: {
    strengths: [String],
    weaknesses: [String],
    improvements: [String]
  },
  evaluationDetails: {
    finalMarks: Number,
    finalFeedback: String,
    aiMarks: Number,
    aiFeedback: String,
    missingPoints: String,
    aiReport: {
      strengths: [String],
      weaknesses: [String],
      improvements: [String]
    },
    evaluatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluatedAt: Date
  }
});

submissionSchema.pre('validate', function syncAliases(next) {
  if (!this.userId && this.student) this.userId = this.student;
  if (!this.student && this.userId) this.student = this.userId;

  if (!this.taskId && this.task) this.taskId = this.task;
  if (!this.task && this.taskId) this.task = this.taskId;

  if (!this.submissionFile && this.fileUrl) this.submissionFile = this.fileUrl;
  if (!this.fileUrl && this.submissionFile) this.fileUrl = this.submissionFile;

  if (!this.remarks && this.feedback) this.remarks = this.feedback;
  if (!this.feedback && this.remarks) this.feedback = this.remarks;

  if (!this.evaluatedBy && this.evaluator) this.evaluatedBy = this.evaluator;
  if (!this.evaluator && this.evaluatedBy) this.evaluator = this.evaluatedBy;

  const hasEvaluation =
    typeof this.marks === 'number' ||
    Boolean(this.evaluatedBy || this.evaluator || this.evaluatedAt);

  if (hasEvaluation) {
    this.status = 'evaluated';
    if (!this.evaluatedAt) this.evaluatedAt = new Date();
  } else if (!this.status) {
    this.status = 'pending';
  }

  this.aiReport = normalizeAiReport(this.aiReport);

  if (!this.evaluationDetails || typeof this.evaluationDetails !== 'object') {
    this.evaluationDetails = {};
  }

  this.evaluationDetails.aiReport = normalizeAiReport(
    this.evaluationDetails.aiReport || this.aiReport
  );

  next();
});

submissionSchema.index({ taskId: 1, userId: 1 });
submissionSchema.index({ task: 1, student: 1 });

module.exports = mongoose.model('Submission', submissionSchema);

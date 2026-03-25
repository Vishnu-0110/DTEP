const mongoose = require('mongoose');

const { Schema } = mongoose;

const aiReportSchema = new Schema(
  {
    strengths: {
      type: [String],
      default: [],
    },
    weaknesses: {
      type: [String],
      default: [],
    },
    improvements: {
      type: [String],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const submissionSchema = new Schema(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
      index: true,
    },
    task: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    student: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    submissionFile: {
      type: String,
      default: '',
      trim: true,
    },
    fileUrl: {
      type: String,
      default: '',
      trim: true,
    },
    fileName: {
      type: String,
      default: '',
      trim: true,
    },
    answer: {
      type: String,
      default: '',
      trim: true,
    },
    marks: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    remarks: {
      type: String,
      default: '',
      trim: true,
    },
    feedback: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'evaluated'],
      default: 'pending',
      index: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    evaluatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    evaluator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: null,
    },
    aiMarks: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    aiFeedback: {
      type: String,
      default: '',
      trim: true,
    },
    missingPoints: {
      type: String,
      default: '',
      trim: true,
    },
    aiEvaluatedAt: {
      type: Date,
      default: null,
    },
    aiModel: {
      type: String,
      default: null,
      trim: true,
    },
    aiRawResponse: {
      type: Schema.Types.Mixed,
      default: null,
    },
    aiReport: {
      type: aiReportSchema,
      default: () => ({
        strengths: [],
        weaknesses: [],
        improvements: [],
      }),
    },
    evaluationDetails: {
      type: Schema.Types.Mixed,
      default: null,
    },
    isAutoZero: {
      type: Boolean,
      default: false,
      index: true,
    },
    allowResubmission: {
      type: Boolean,
      default: false,
      index: true,
    },
    reopenReason: {
      type: String,
      default: '',
      trim: true,
    },
    reopenedAt: {
      type: Date,
      default: null,
    },
    reopenedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resubmissionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

submissionSchema.index({ submittedAt: -1 });
submissionSchema.index({ taskId: 1, submittedAt: -1 });
submissionSchema.index({ task: 1, submittedAt: -1 });

submissionSchema.pre('validate', function syncLegacyRefs(next) {
  if (!this.task && this.taskId) {
    this.task = this.taskId;
  }

  if (!this.taskId && this.task) {
    this.taskId = this.task;
  }

  if (!this.student && this.userId) {
    this.student = this.userId;
  }

  if (!this.userId && this.student) {
    this.userId = this.student;
  }

  if (!this.fileUrl && this.submissionFile) {
    this.fileUrl = this.submissionFile;
  }

  if (!this.submissionFile && this.fileUrl) {
    this.submissionFile = this.fileUrl;
  }

  if (!this.feedback && this.remarks) {
    this.feedback = this.remarks;
  }

  if (!this.remarks && this.feedback) {
    this.remarks = this.feedback;
  }

  if (!this.evaluator && this.evaluatedBy) {
    this.evaluator = this.evaluatedBy;
  }

  if (!this.evaluatedBy && this.evaluator) {
    this.evaluatedBy = this.evaluator;
  }

  return next();
});

module.exports = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

const mongoose = require('mongoose');

const helpdeskQuerySchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8000,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      lowercase: true,
      trim: true,
    },
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    raisedByRole: {
      type: String,
      enum: ['student', 'evaluator'],
      required: true,
      lowercase: true,
      trim: true,
    },
    raisedByName: {
      type: String,
      required: true,
      trim: true,
    },
    raisedByEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    raisedByDepartment: {
      type: String,
      default: '',
      trim: true,
    },
    adminNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 8000,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

helpdeskQuerySchema.index({ status: 1, createdAt: -1 });

module.exports =
  mongoose.models.HelpdeskQuery || mongoose.model('HelpdeskQuery', helpdeskQuerySchema);


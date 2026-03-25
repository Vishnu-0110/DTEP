const mongoose = require('mongoose');

const rubricSectionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: '',
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    maxMarks: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    required: {
      type: Boolean,
      default: true,
    },
    minWords: {
      type: Number,
      default: 220,
      min: 0,
      max: 2000,
    },
    aliases: {
      type: [String],
      default: [],
    },
    guidance: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    deadline: {
      type: Date,
      required: true,
    },
    requiredPages: {
      type: Number,
      default: 0,
      min: 0,
      max: 500,
    },
    rubricText: {
      type: String,
      default: '',
      trim: true,
    },
    rubricSections: {
      type: [rubricSectionSchema],
      default: [],
    },
    rubricModel: {
      type: String,
      default: '',
      trim: true,
    },
    rubricGeneratedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ createdAt: -1 });
taskSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);

const mongoose = require('mongoose');

const { Schema } = mongoose;

const submissionBlobSchema = new Schema(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: 'Submission',
      required: true,
      unique: true,
      index: true,
    },
    fileData: {
      type: Buffer,
      required: true,
    },
    fileMimeType: {
      type: String,
      default: 'application/octet-stream',
      trim: true,
    },
    fileName: {
      type: String,
      default: 'submission-file',
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.SubmissionBlob || mongoose.model('SubmissionBlob', submissionBlobSchema);

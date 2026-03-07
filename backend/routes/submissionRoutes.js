
const express = require('express');
const router = express.Router();
const { 
  submitTask, 
  evaluateSubmission, 
  getSubmissionsByTask, 
  getStudentSubmissions,
  generateAiAssist,
  viewSubmissionFile
} = require('../controllers/submissionController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/:taskId/submit', protect, authorize('student'), upload.single('file'), submitTask);
router.get('/task/:taskId', protect, authorize('evaluator'), getSubmissionsByTask);
router.get('/my-submissions', protect, authorize('student'), getStudentSubmissions);
router.get('/:id/view', protect, viewSubmissionFile);
router.post('/:id/ai-assist', protect, authorize('evaluator', 'admin'), generateAiAssist);
router.put('/:id/evaluate', protect, authorize('evaluator'), evaluateSubmission);

module.exports = router;

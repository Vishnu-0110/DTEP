const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getMaintenanceStatus,
  updateMaintenanceStatus,
  getStudentNotifications,
  getEvaluatorNotifications
} = require('../controllers/systemController');

router.get('/maintenance', protect, getMaintenanceStatus);
router.put('/maintenance', protect, authorize('admin'), updateMaintenanceStatus);
router.get('/student-notifications', protect, authorize('student'), getStudentNotifications);
router.get('/evaluator-notifications', protect, authorize('evaluator'), getEvaluatorNotifications);

module.exports = router;

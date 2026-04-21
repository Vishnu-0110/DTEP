const express = require('express');
const router = express.Router();
const {
  createQuery,
  getMyQueries,
  getAllQueries,
  updateQueryStatus,
} = require('../controllers/helpdeskController');
const { protect, authorize } = require('../middleware/auth');

router.route('/queries')
  .get(protect, authorize('admin'), getAllQueries)
  .post(protect, authorize('student', 'evaluator'), createQuery);

router.route('/queries/my')
  .get(protect, authorize('student', 'evaluator'), getMyQueries);

router.route('/queries/:id')
  .patch(protect, authorize('admin'), updateQueryStatus);

module.exports = router;


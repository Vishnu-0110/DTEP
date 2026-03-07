
const express = require('express');
const router = express.Router();
const { createTask, getTasks, getTaskById, deleteTask } = require('../controllers/taskController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, getTasks)
  .post(protect, authorize('evaluator'), createTask);

router.route('/:id')
  .get(protect, getTaskById)
  .delete(protect, authorize('evaluator', 'admin'), deleteTask);

module.exports = router;

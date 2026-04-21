const mongoose = require('mongoose');
const HelpdeskQuery = require('../models/HelpdeskQuery');

const normalizeText = (value, max) => String(value || '').trim().slice(0, max);

exports.createQuery = async (req, res) => {
  try {
    const subject = normalizeText(req.body?.subject, 200);
    const message = normalizeText(req.body?.message, 8000);

    if (!subject || !message) {
      return res.status(400).json({ message: 'subject and message are required.' });
    }

    const user = req.user;
    const role = String(user?.role || '').trim().toLowerCase();
    if (role !== 'student' && role !== 'evaluator') {
      return res.status(403).json({ message: 'Only students and evaluators can raise queries.' });
    }

    const query = await HelpdeskQuery.create({
      subject,
      message,
      status: 'open',
      raisedBy: user._id,
      raisedByRole: role,
      raisedByName: String(user?.name || '').trim(),
      raisedByEmail: String(user?.email || '').trim().toLowerCase(),
      raisedByDepartment: String(user?.department || '').trim(),
    });

    return res.status(201).json(query);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getMyQueries = async (req, res) => {
  try {
    const userId = req.user?._id;
    const items = await HelpdeskQuery.find({ raisedBy: userId }).sort('-createdAt').lean();
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getAllQueries = async (req, res) => {
  try {
    const status = String(req.query?.status || '').trim().toLowerCase();
    const filter = status ? { status } : {};
    const items = await HelpdeskQuery.find(filter).sort('-createdAt').lean();
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.updateQueryStatus = async (req, res) => {
  const id = String(req.params?.id || '').trim();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid query ID format' });
  }

  const status = String(req.body?.status || '').trim().toLowerCase();
  const adminNotes = normalizeText(req.body?.adminNotes, 8000);
  const allowed = new Set(['open', 'in_progress', 'resolved', 'closed']);
  if (!allowed.has(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }

  try {
    const isResolved = status === 'resolved' || status === 'closed';
    const update = {
      status,
      adminNotes,
      resolvedAt: isResolved ? new Date() : null,
      resolvedBy: isResolved ? req.user?._id : null,
    };

    const updated = await HelpdeskQuery.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Query not found' });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};


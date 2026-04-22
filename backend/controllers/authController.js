
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const generateToken = (id, sessionVersion) => {
  return jwt.sign({ id, sessionVersion }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const MAX_PROFILE_PHOTO_BYTES = 1024 * 1024; // 1MB

const estimateBase64Bytes = (base64) => {
  const normalized = String(base64 || '').trim();
  if (!normalized) return 0;

  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
};

const normalizeProfilePhoto = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { value: '' };

  const lowered = raw.toLowerCase();
  if (lowered.startsWith('http://') || lowered.startsWith('https://')) {
    return { error: 'Profile photo must be uploaded as a PNG/JPG file, not a link.' };
  }

  if (!lowered.startsWith('data:image/')) {
    return { error: 'Profile photo must be a PNG/JPG/JPEG upload.' };
  }

  const allowedPrefixes = ['data:image/png;base64,', 'data:image/jpeg;base64,', 'data:image/jpg;base64,'];
  if (!allowedPrefixes.some((prefix) => lowered.startsWith(prefix))) {
    return { error: 'Only PNG/JPG/JPEG profile photos are supported.' };
  }

  const commaIndex = raw.indexOf(',');
  if (commaIndex === -1) {
    return { error: 'Invalid profile photo data.' };
  }

  const encoded = raw.slice(commaIndex + 1).trim();
  const estimatedBytes = estimateBase64Bytes(encoded);
  if (estimatedBytes > MAX_PROFILE_PHOTO_BYTES) {
    return { error: 'Profile photo is too large. Please upload an image up to 1MB.' };
  }

  return { value: raw };
};

exports.registerUser = async (req, res) => {
  const { name, email, password, role, department, profilePhoto } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const normalizedPhoto = normalizeProfilePhoto(profilePhoto);
    if (normalizedPhoto.error) {
      return res.status(400).json({ message: normalizedPhoto.error });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      department,
      profilePhoto: normalizedPhoto.value,
      sessionVersion: 1,
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || '',
      profilePhoto: user.profilePhoto || '',
      token: generateToken(user._id, user.sessionVersion),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  const { email, password, expectedRole } = req.body;
  try {
    const user = await User.findOne({ email });
    if (user && (await user.comparePassword(password))) {
      const normalizedExpectedRole = String(expectedRole || '').trim().toLowerCase();
      const knownRoles = new Set(['admin', 'evaluator', 'student']);

      if (normalizedExpectedRole && knownRoles.has(normalizedExpectedRole) && user.role !== normalizedExpectedRole) {
        return res.status(401).json({
          message: `${normalizedExpectedRole} not found. Recheck access tier.`
        });
      }

      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $inc: { sessionVersion: 1 } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        department: updatedUser.department || '',
        profilePhoto: updatedUser.profilePhoto || '',
        token: generateToken(updatedUser._id, Number(updatedUser.sessionVersion || 0)),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  
  // Validate if the ID is a valid MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid user ID format' });
  }

  try {
    const user = await User.findById(id);
    if (user) {
      await user.deleteOne();
      res.json({ message: 'User removed successfully' });
    } else {
      res.status(404).json({ message: 'User not found in system' });
    }
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to process deletion request' });
  }
};


const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const generateToken = (id, sessionVersion) => {
  return jwt.sign({ id, sessionVersion }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const normalizeProfilePhoto = (value) => String(value || '').trim();

exports.registerUser = async (req, res) => {
  const { name, email, password, role, department, profilePhoto } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: 'User already exists' });

    const user = await User.create({
      name,
      email,
      password,
      role,
      department,
      profilePhoto: normalizeProfilePhoto(profilePhoto),
      sessionVersion: 1,
    });
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
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

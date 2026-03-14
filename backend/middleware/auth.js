
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SystemSetting = require('../models/SystemSetting');

const GLOBAL_KEY = 'global';
const DEFAULT_MAINTENANCE_MESSAGE = 'The platform is currently under maintenance.';

const isMaintenanceExemptRequest = (req) => {
  const baseUrl = String(req.baseUrl || '').trim();
  const routePath = String(req.path || '').trim();
  return baseUrl === '/api/system' && routePath === '/maintenance' && req.method === 'GET';
};

const toMaintenancePayload = (settingDoc) => ({
  enabled: Boolean(settingDoc?.maintenanceMode),
  message: String(settingDoc?.maintenanceMessage || '').trim() || DEFAULT_MAINTENANCE_MESSAGE,
  updatedAt: settingDoc?.updatedAt || null,
});

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const tokenSessionVersion = Number(decoded?.sessionVersion);
      const activeSessionVersion = Number(req.user?.sessionVersion || 0);
      if (!Number.isFinite(tokenSessionVersion) || tokenSessionVersion !== activeSessionVersion) {
        return res.status(401).json({
          message: 'Session expired. This account was signed in from another device.',
        });
      }

      const isAdmin = req.user.role === 'admin';
      if (!isAdmin && !isMaintenanceExemptRequest(req)) {
        const setting = await SystemSetting.findOne({ key: GLOBAL_KEY })
          .select('maintenanceMode maintenanceMessage updatedAt')
          .lean();

        if (setting?.maintenanceMode) {
          return res.status(503).json({
            message: String(setting.maintenanceMessage || '').trim() || DEFAULT_MAINTENANCE_MESSAGE,
            code: 'MAINTENANCE_MODE',
            maintenance: toMaintenancePayload(setting),
          });
        }
      }
      
      return next();
    } catch (error) {
      console.error('JWT Error:', error.message);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `User role ${req.user.role} is not authorized to access this route` 
      });
    }
    next();
  };
};

module.exports = { protect, authorize };

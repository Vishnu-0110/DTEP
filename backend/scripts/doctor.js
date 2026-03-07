const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { resolveUploadDir } = require('../config/storage');

const checks = [];

const addCheck = (name, status, message, level = 'error') => {
  checks.push({ name, status, message, level });
};

const env = process.env.NODE_ENV || 'development';
const portValue = Number(process.env.PORT || 5000);
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const mongoUri = String(process.env.MONGODB_URI || '').trim();
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const uploadDir = resolveUploadDir();

addCheck('NODE_ENV', ['development', 'production', 'test'].includes(env), `NODE_ENV=${env}`);
addCheck('PORT', Number.isInteger(portValue) && portValue > 0, `PORT=${process.env.PORT || 5000}`);
addCheck('JWT_SECRET', jwtSecret.length >= 32, jwtSecret ? 'JWT secret present' : 'JWT secret missing');
addCheck(
  'MONGODB_URI',
  /^mongodb(\+srv)?:\/\//.test(mongoUri),
  mongoUri ? 'MongoDB URI present' : 'MongoDB URI missing'
);
addCheck(
  'ALLOWED_ORIGINS',
  env !== 'production' || allowedOrigins.length > 0,
  allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'No CORS allow-list configured',
  env === 'production' ? 'error' : 'warn'
);
addCheck(
  'GEMINI_API_KEY',
  Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
  process.env.GEMINI_API_KEY ? 'Gemini key present' : 'Gemini key missing; AI grading will be disabled',
  'warn'
);
addCheck('UPLOAD_DIR', path.isAbsolute(uploadDir), uploadDir);

const uploadParentDir = path.dirname(uploadDir);
addCheck(
  'UPLOAD_DIR_PARENT',
  fs.existsSync(uploadParentDir),
  fs.existsSync(uploadParentDir) ? `Upload parent exists: ${uploadParentDir}` : `Upload parent missing: ${uploadParentDir}`
);

let hasErrors = false;
for (const check of checks) {
  const label = check.status ? '[OK]' : check.level === 'warn' ? '[WARN]' : '[FAIL]';
  console.log(`${label} ${check.name}: ${check.message}`);
  if (!check.status && check.level !== 'warn') {
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nDeployment doctor failed. Fix the failing checks above before deploying.');
  process.exit(1);
}

console.log('\nDeployment doctor passed.');

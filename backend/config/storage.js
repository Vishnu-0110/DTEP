const fs = require('fs');
const path = require('path');

const defaultUploadDir = path.join(__dirname, '..', 'uploads');

const resolveUploadDir = () => {
  const configuredDir = String(process.env.UPLOAD_DIR || '').trim();
  if (!configuredDir) {
    return path.resolve(defaultUploadDir);
  }

  return path.isAbsolute(configuredDir)
    ? path.resolve(configuredDir)
    : path.resolve(__dirname, '..', configuredDir);
};

const ensureUploadDir = () => {
  const uploadDir = resolveUploadDir();
  fs.mkdirSync(uploadDir, { recursive: true });
  return uploadDir;
};

module.exports = {
  resolveUploadDir,
  ensureUploadDir,
};

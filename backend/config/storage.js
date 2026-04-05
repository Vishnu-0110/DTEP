const fs = require('fs');
const path = require('path');

const defaultUploadDir = path.join(__dirname, '..', 'uploads');
const persistentDataRoot = '/var/data';

const canUsePersistentDataRoot = () => {
  try {
    return fs.existsSync(persistentDataRoot);
  } catch (_) {
    return false;
  }
};

const resolveUploadDir = () => {
  const configuredDir = String(process.env.UPLOAD_DIR || '').trim();
  if (!configuredDir) {
    if (canUsePersistentDataRoot()) {
      return path.resolve(path.join(persistentDataRoot, 'dtep-uploads'));
    }
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

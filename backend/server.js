const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const statsRoutes = require('./routes/statsRoutes');
const systemRoutes = require('./routes/systemRoutes');
const { ensureUploadDir, resolveUploadDir } = require('./config/storage');

const jwtSecret = String(process.env.JWT_SECRET || '').trim();
if (!jwtSecret) {
  console.error('ERROR: JWT_SECRET is not defined in the backend environment.');
  process.exit(1);
}

const uploadDir = ensureUploadDir();
const isDevelopment = process.env.NODE_ENV === 'development';
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const getDatabaseStatus = () => (mongoose.connection.readyState === 1 ? 'connected' : 'disconnected');

const buildStatusPayload = () => ({
  service: 'dtep-backend',
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString(),
  checks: {
    database: getDatabaseStatus(),
    uploads: fs.existsSync(uploadDir) ? 'ready' : 'missing',
    jwt: 'configured',
    gemini: String(process.env.GEMINI_API_KEY || '').trim() ? 'configured' : 'missing',
  },
  config: {
    uploadDir: resolveUploadDir(),
    corsMode: allowedOrigins.length > 0 ? 'allow-list' : 'open',
  },
});

const corsOrigin = (origin, callback) => {
  if (!origin || allowedOrigins.length === 0) {
    return callback(null, true);
  }

  if (allowedOrigins.includes(origin)) {
    return callback(null, true);
  }

  return callback(new Error('Origin not allowed by CORS'));
};

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

if (isDevelopment) {
  app.use(morgan('dev'));
}

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/system', systemRoutes);

app.get('/healthz', (req, res) => {
  return res.json({
    status: 'ok',
    ...buildStatusPayload(),
  });
});

app.get('/readyz', (req, res) => {
  const isReady = getDatabaseStatus() === 'connected' && fs.existsSync(uploadDir);

  return res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    ...buildStatusPayload(),
  });
});

app.get('/', (req, res) => {
  return res.json({
    status: 'DTEP API Service Online',
    ...buildStatusPayload(),
  });
});

app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err.message);
  return res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: isDevelopment ? err.stack : undefined,
  });
});

const PORT = Number(process.env.PORT || 5000);
let server;

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down DTEP backend...`);

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) return reject(error);
        return resolve();
      });
    });
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(false);
  }

  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(`Failed to shutdown cleanly: ${error.message}`);
      process.exit(1);
    });
  });
});

const startServer = async () => {
  await connectDB();

  server = await new Promise((resolve, reject) => {
    const instance = app.listen(PORT, () => {
      console.log('-----------------------------------------------');
      console.log(`DTEP Backend Running at http://localhost:${PORT}`);
      console.log(`Upload directory: ${uploadDir}`);
      console.log(`MongoDB Target: ${process.env.MONGODB_URI ? 'Atlas/Env' : 'Missing MONGODB_URI'}`);
      console.log('-----------------------------------------------');
      resolve(instance);
    });

    instance.once('error', reject);
  });
};

startServer().catch((error) => {
  console.error(`Failed to start backend: ${error.message}`);
  process.exit(1);
});

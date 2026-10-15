import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import env from './config/env.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { authenticate } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { projectRouter } from './routes/projects.js';
import { boardRouter } from './routes/boards.js';
import { taskRouter } from './routes/tasks.js';
import { notificationRouter } from './routes/notifications.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  // Static uploads directory for attachments and pasted images
  const uploadsDir = path.resolve('uploads');
  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/uploads', express.static(uploadsDir));

  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'orbit-api', timestamp: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/projects', authenticate, projectRouter);
  app.use('/api/boards', authenticate, boardRouter);
  app.use('/api/tasks', authenticate, taskRouter);
  app.use('/api/notifications', authenticate, notificationRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
};

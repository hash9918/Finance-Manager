import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { requireAuth } from './middleware/auth.js';
import { transactionRoutes } from './routes/transactions.js';
import { authRoutes } from './routes/auth.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transactions', requireAuth, transactionRoutes);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === 'object' && 'name' in err && err.name === 'ZodError') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
});

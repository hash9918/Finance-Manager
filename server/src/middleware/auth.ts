import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express { interface Request { auth?: { userId: string; sessionId: string } } }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken;
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } });
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error('Invalid token claims');
    req.auth = { userId: payload.sub, sessionId: payload.sid };
    next();
  } catch {
    return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Session expired or invalid' } });
  }
}

export function ownerId(req: Request): string {
  if (!req.auth?.userId) throw new Error('Authentication middleware is required');
  return req.auth.userId;
}

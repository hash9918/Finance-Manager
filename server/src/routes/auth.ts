import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { User } from '../models/User.js';

export const authRoutes = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const accessCookie = 'accessToken';
const refreshCookie = 'refreshToken';
const secure = process.env.NODE_ENV === 'production';
const cookieBase = { httpOnly: true, secure, sameSite: 'lax' as const };
const accessSecret = () => process.env.JWT_ACCESS_SECRET!;
const refreshSecret = () => process.env.JWT_REFRESH_SECRET!;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

async function issueSession(res: import('express').Response, userId: string, sessionId = randomUUID()) {
  const accessToken = jwt.sign({ sid: sessionId }, accessSecret(), { subject: userId, expiresIn: '15m', issuer: 'money-manager' });
  const refreshToken = jwt.sign({ sid: sessionId }, refreshSecret(), { subject: userId, expiresIn: '30d', issuer: 'money-manager', jwtid: randomUUID() });
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await User.updateOne({ _id: userId }, { $push: { refreshSessions: { $each: [{ tokenHash: digest(refreshToken), sessionId, expiresAt }], $slice: -10 } } });
  res.cookie(accessCookie, accessToken, { ...cookieBase, path: '/api/v1', maxAge: 15 * 60 * 1000 });
  res.cookie(refreshCookie, refreshToken, { ...cookieBase, path: '/api/v1/auth', maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function clearCookies(res: import('express').Response) {
  res.clearCookie(accessCookie, { ...cookieBase, path: '/api/v1' });
  res.clearCookie(refreshCookie, { ...cookieBase, path: '/api/v1/auth' });
}

authRoutes.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = z.object({
      email: z.string().email().max(254), password: z.string().min(12).max(128), displayName: z.string().trim().min(1).max(100)
    }).strict().parse(req.body);
    const normalizedEmail = email.toLowerCase();
    if (await User.exists({ email: normalizedEmail })) return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account already exists for this email' } });
    const user = await User.create({ email: normalizedEmail, passwordHash: await bcrypt.hash(password, 12), displayName });
    await issueSession(res, String(user._id));
    res.status(201).json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, currency: user.currency } });
  } catch (error) { next(error); }
});

authRoutes.post('/login', async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) }).strict().parse(req.body);
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } });
    await issueSession(res, String(user._id));
    res.json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, currency: user.currency } });
  } catch (error) { next(error); }
});

// Accept a Google Identity Services ID credential; the server validates signature, issuer, audience and expiry.
authRoutes.post('/google', async (req, res, next) => {
  try {
    const { credential } = z.object({ credential: z.string().min(1).max(8192) }).strict().parse(req.body);
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: { code: 'OAUTH_UNCONFIGURED', message: 'Google sign-in is not configured' } });
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const claims = ticket.getPayload();
    if (!claims?.sub || !claims.email || !claims.email_verified) return res.status(401).json({ error: { code: 'INVALID_GOOGLE_CREDENTIAL', message: 'Google account could not be verified' } });
    let user = await User.findOne({ googleSubject: claims.sub });
    if (!user) {
      user = await User.findOneAndUpdate({ email: claims.email.toLowerCase(), googleSubject: { $exists: false } }, {
        $set: { googleSubject: claims.sub, displayName: claims.name || claims.email.split('@')[0] }
      }, { new: true });
    }
    if (!user) user = await User.create({ email: claims.email.toLowerCase(), googleSubject: claims.sub, displayName: claims.name || claims.email.split('@')[0] });
    await issueSession(res, String(user._id));
    res.json({ user: { id: String(user._id), email: user.email, displayName: user.displayName, currency: user.currency } });
  } catch (error) { next(error); }
});

authRoutes.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[refreshCookie];
    if (!token) { clearCookies(res); return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Refresh session is missing' } }); }
    const claims = jwt.verify(token, refreshSecret(), { issuer: 'money-manager' }) as jwt.JwtPayload;
    if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') throw new Error('Invalid refresh claims');
    const replacement = jwt.sign({ sid: claims.sid }, refreshSecret(), { subject: claims.sub, expiresIn: '30d', issuer: 'money-manager', jwtid: randomUUID() });
    const accessToken = jwt.sign({ sid: claims.sid }, accessSecret(), { subject: claims.sub, expiresIn: '15m', issuer: 'money-manager' });
    const rotated = await User.updateOne({ _id: claims.sub, refreshSessions: { $elemMatch: { sessionId: claims.sid, tokenHash: digest(token), expiresAt: { $gt: new Date() } } } }, {
      $set: { 'refreshSessions.$.tokenHash': digest(replacement), 'refreshSessions.$.expiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });
    if (!rotated.modifiedCount) { clearCookies(res); return res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Refresh session has expired or was already used' } }); }
    res.cookie(accessCookie, accessToken, { ...cookieBase, path: '/api/v1', maxAge: 15 * 60 * 1000 });
    res.cookie(refreshCookie, replacement, { ...cookieBase, path: '/api/v1/auth', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.status(204).end();
  } catch {
    clearCookies(res);
    res.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Refresh session has expired or is invalid' } });
  }
});

authRoutes.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[refreshCookie];
    if (token) {
      try {
        const claims = jwt.verify(token, refreshSecret(), { issuer: 'money-manager' }) as jwt.JwtPayload;
        if (typeof claims.sub === 'string' && typeof claims.sid === 'string') await User.updateOne({ _id: claims.sub }, { $pull: { refreshSessions: { sessionId: claims.sid, tokenHash: digest(token) } } });
      } catch { /* Expired or malformed cookies are still cleared. */ }
    }
    clearCookies(res);
    res.status(204).end();
  } catch (error) { next(error); }
});

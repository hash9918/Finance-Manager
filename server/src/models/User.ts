import { model, Schema, Types } from 'mongoose';

const RefreshSessionSchema = new Schema({
  tokenHash: { type: String, required: true },
  sessionId: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { _id: false });

const UserSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, select: false },
  googleSubject: { type: String, sparse: true, unique: true },
  displayName: { type: String, trim: true, maxlength: 100 },
  currency: { type: String, default: 'INR', uppercase: true, match: /^[A-Z]{3}$/ },
  timezone: { type: String, default: 'Asia/Kolkata' },
  refreshSessions: { type: [RefreshSessionSchema], default: [], select: false }
}, { timestamps: true, strict: 'throw' });

export type UserDocument = { _id: Types.ObjectId; email: string };
export const User = model('User', UserSchema);

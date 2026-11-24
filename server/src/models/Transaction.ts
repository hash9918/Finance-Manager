import { model, Schema, Types } from 'mongoose';

const RecurrenceSchema = new Schema({
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },
  interval: { type: Number, min: 1, max: 120, default: 1 },
  startsAt: { type: Date, required: true },
  endsAt: Date,
  nextRunAt: Date,
  timezone: { type: String, default: 'Asia/Kolkata' }
}, { _id: false });

const TransactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String, required: true, maxlength: 80 },
  type: { type: String, enum: ['expense', 'income'], required: true },
  amountMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  paymentMode: { type: String, enum: ['upi', 'cash', 'credit_card', 'debit_card', 'net_banking', 'other'], default: 'other' },
  occurredAt: { type: Date, required: true, index: true },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  merchant: { type: String, trim: true, maxlength: 160 },
  tags: { type: [String], default: [], validate: (v: string[]) => v.length <= 30 },
  recurrence: { type: RecurrenceSchema, default: undefined },
  recurrenceId: { type: String, index: true },
  revision: { type: Number, default: 1, min: 1 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true, strict: 'throw' });

TransactionSchema.index({ userId: 1, clientId: 1 }, { unique: true });
TransactionSchema.index({ userId: 1, occurredAt: -1, _id: -1 });
TransactionSchema.index({ userId: 1, type: 1, categoryId: 1, occurredAt: -1 });
export type TransactionDocument = { _id: Types.ObjectId; userId: Types.ObjectId; clientId: string; revision: number };
export const Transaction = model('Transaction', TransactionSchema);

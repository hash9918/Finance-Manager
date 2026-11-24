import { model, Schema, Types } from 'mongoose';

const BudgetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  limitMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  warnAtPercent: { type: Number, default: 80, min: 1, max: 100 }
}, { timestamps: true, strict: 'throw' });
BudgetSchema.index({ userId: 1, month: 1, categoryId: 1 }, { unique: true });
export type BudgetDocument = { _id: Types.ObjectId; userId: Types.ObjectId; month: string };
export const Budget = model('Budget', BudgetSchema);

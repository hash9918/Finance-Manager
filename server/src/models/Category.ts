import { model, Schema, Types } from 'mongoose';

const CategorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 50 },
  icon: { type: String, default: 'tag', maxlength: 40 },
  color: { type: String, default: '#64748b', match: /^#[0-9a-fA-F]{6}$/ },
  appliesTo: { type: String, enum: ['expense', 'income', 'both'], default: 'expense' },
  isArchived: { type: Boolean, default: false }
}, { timestamps: true, strict: 'throw' });
CategorySchema.index({ userId: 1, name: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
export type CategoryDocument = { _id: Types.ObjectId; userId: Types.ObjectId | null; name: string };
export const Category = model('Category', CategorySchema);

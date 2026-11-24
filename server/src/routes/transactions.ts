import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Category } from '../models/Category.js';
import { Transaction } from '../models/Transaction.js';
import { ownerId } from '../middleware/auth.js';

export const transactionRoutes = Router();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const transactionInput = z.object({
  clientId: z.string().min(1).max(80), type: z.enum(['expense', 'income']),
  amountMinor: z.number().int().positive().safe(), currency: z.string().regex(/^[A-Za-z]{3}$/).default('INR'),
  categoryId: z.string().nullable().optional(), paymentMode: z.enum(['upi', 'cash', 'credit_card', 'debit_card', 'net_banking', 'other']).default('other'),
  occurredAt: z.coerce.date(), description: z.string().max(500).default(''), merchant: z.string().max(160).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([])
}).strict();

transactionRoutes.get('/', async (req, res, next) => {
  try {
    const userId = ownerId(req);
    const filter: Record<string, unknown> = { userId, deletedAt: null };
    if (req.query.from || req.query.to) {
      const occurredAt: Record<string, Date> = {};
      if (req.query.from) occurredAt.$gte = new Date(String(req.query.from));
      if (req.query.to) occurredAt.$lt = new Date(String(req.query.to));
      filter.occurredAt = occurredAt;
    }
    if (req.query.type === 'expense' || req.query.type === 'income') filter.type = req.query.type;
    if (req.query.categoryId && Types.ObjectId.isValid(String(req.query.categoryId))) filter.categoryId = req.query.categoryId;
    if (req.query.paymentMode) filter.paymentMode = req.query.paymentMode;
    if (req.query.q) filter.$or = [
      { description: { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' } },
      { tags: { $regex: escapeRegex(String(req.query.q).slice(0, 80)), $options: 'i' } }
    ];
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    if (req.query.cursor && Types.ObjectId.isValid(String(req.query.cursor))) filter._id = { $lt: req.query.cursor };
    const rows = await Transaction.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    res.json({ items, nextCursor: hasMore ? String(items.at(-1)?._id) : null });
  } catch (error) { next(error); }
});

transactionRoutes.post('/', async (req, res, next) => {
  try {
    const data = transactionInput.parse(req.body);
    const userId = ownerId(req);
    if (data.categoryId) {
      if (!Types.ObjectId.isValid(data.categoryId)) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Invalid category ID' } });
      const category = await Category.findOne({ _id: data.categoryId, $or: [{ userId }, { userId: null }], isArchived: false }).lean();
      if (!category) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Category is unavailable' } });
    }
    const item = await Transaction.findOneAndUpdate(
      { userId, clientId: data.clientId },
      { $setOnInsert: { ...data, currency: data.currency.toUpperCase(), userId, revision: 1 } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ item });
  } catch (error) { next(error); }
});

transactionRoutes.patch('/:id', async (req, res, next) => {
  try {
    if (!Types.ObjectId.isValid(req.params.id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    const patch = z.object({ type: z.enum(['expense', 'income']).optional(), amountMinor: z.number().int().positive().safe().optional(),
      currency: z.string().regex(/^[A-Za-z]{3}$/).optional(), categoryId: z.string().nullable().optional(),
      paymentMode: z.enum(['upi', 'cash', 'credit_card', 'debit_card', 'net_banking', 'other']).optional(),
      occurredAt: z.coerce.date().optional(), description: z.string().max(500).optional(), merchant: z.string().max(160).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(30).optional() }).strict().parse(req.body);
    if (patch.categoryId) {
      if (!Types.ObjectId.isValid(patch.categoryId)) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Invalid category ID' } });
      const category = await Category.findOne({ _id: patch.categoryId, $or: [{ userId: ownerId(req) }, { userId: null }], isArchived: false }).lean();
      if (!category) return res.status(400).json({ error: { code: 'INVALID_CATEGORY', message: 'Category is unavailable' } });
    }
    const item = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: ownerId(req), deletedAt: null },
      { $set: { ...patch, ...(patch.currency ? { currency: patch.currency.toUpperCase() } : {}) }, $inc: { revision: 1 } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    res.json({ item });
  } catch (error) { next(error); }
});

transactionRoutes.delete('/:id', async (req, res, next) => {
  try {
    const item = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: ownerId(req), deletedAt: null },
      { $set: { deletedAt: new Date() }, $inc: { revision: 1 } }, { new: true }
    );
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
    res.status(204).end();
  } catch (error) { next(error); }
});

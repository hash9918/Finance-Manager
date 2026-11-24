import Dexie, { type EntityTable } from 'dexie';

export type LocalTransaction = {
  clientId: string; serverId?: string; type: 'expense' | 'income'; amountMinor: number; currency: string;
  categoryId?: string | null; paymentMode: 'upi' | 'cash' | 'credit_card' | 'debit_card' | 'net_banking' | 'other';
  occurredAt: string; description: string; merchant?: string; tags: string[]; revision?: number;
  syncState: 'pending' | 'synced' | 'conflict'; updatedAt: number;
};
export type OutboxItem = {
  id?: number; clientId: string; method: 'POST' | 'PATCH' | 'DELETE'; path: string;
  body?: Record<string, unknown>; attempts: number; nextAttemptAt: number; createdAt: number;
};

class MoneyDatabase extends Dexie {
  transactions!: EntityTable<LocalTransaction, 'clientId'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  constructor() {
    super('personal-money-manager');
    this.version(1).stores({ transactions: 'clientId, serverId, occurredAt, type, categoryId, syncState', outbox: '++id, clientId, nextAttemptAt, createdAt' });
  }
}
export const db = new MoneyDatabase();

// Record the optimistic local row and its retryable mutation atomically.
export async function saveOfflineTransaction(input: Omit<LocalTransaction, 'clientId' | 'syncState' | 'updatedAt'>) {
  const clientId = crypto.randomUUID();
  const local: LocalTransaction = { ...input, clientId, syncState: 'pending', updatedAt: Date.now() };
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(local);
    await db.outbox.add({ clientId, method: 'POST', path: '/transactions', body: {
      clientId, type: local.type, amountMinor: local.amountMinor, currency: local.currency,
      categoryId: local.categoryId ?? null, paymentMode: local.paymentMode, occurredAt: local.occurredAt,
      description: local.description, merchant: local.merchant, tags: local.tags
    }, attempts: 0, nextAttemptAt: Date.now(), createdAt: Date.now() });
  });
  return local;
}

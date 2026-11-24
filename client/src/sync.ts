import { db, type OutboxItem } from './db';

let running = false;
const apiBase = '/api/v1';
const retryDelay = (attempt: number) => Math.min(15 * 60_000, 1000 * 2 ** Math.min(attempt, 10)) * (0.75 + Math.random() * 0.5);

async function send(item: OutboxItem) {
  return fetch(`${apiBase}${item.path}`, {
    method: item.method, credentials: 'include', headers: { 'Content-Type': 'application/json' },
    ...(item.body ? { body: JSON.stringify(item.body) } : {})
  });
}

export async function flushOutbox() {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const pending = await db.outbox.orderBy('createdAt').toArray();
    for (const item of pending) {
      if (item.nextAttemptAt > Date.now()) continue;
      let response: Response;
      try { response = await send(item); }
      catch { await reschedule(item); break; }
      if (response.ok || response.status === 409) {
        const result = response.status === 204 ? undefined : await response.json().catch(() => undefined);
        await db.transaction('rw', db.outbox, db.transactions, async () => {
          if (item.id !== undefined) await db.outbox.delete(item.id);
          const local = await db.transactions.get(item.clientId);
          if (local && response.status !== 409) await db.transactions.put({ ...local, serverId: result?.item?._id, revision: result?.item?.revision, syncState: 'synced', updatedAt: Date.now() });
          if (local && response.status === 409) await db.transactions.put({ ...local, syncState: 'conflict', updatedAt: Date.now() });
        });
      } else if (response.status === 401) {
        // Refresh once through the same-origin cookie endpoint. Keep the outbox if signed out.
        const refreshed = await fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
        if (refreshed?.ok) {
          const retry = await send(item).catch(() => undefined);
          if (retry?.ok) {
            const result = retry.status === 204 ? undefined : await retry.json().catch(() => undefined);
            await db.transaction('rw', db.outbox, db.transactions, async () => {
              if (item.id !== undefined) await db.outbox.delete(item.id);
              const local = await db.transactions.get(item.clientId);
              if (local) await db.transactions.put({ ...local, serverId: result?.item?._id, revision: result?.item?.revision, syncState: 'synced', updatedAt: Date.now() });
            });
            continue;
          }
        }
        break;
      } else if (response.status >= 500 || response.status === 429) {
        await reschedule(item); break;
      } else {
        // Validation/authorization failures stay visible locally for the user to resolve.
        await db.transaction('rw', db.outbox, db.transactions, async () => {
          if (item.id !== undefined) await db.outbox.delete(item.id);
          const local = await db.transactions.get(item.clientId);
          if (local) await db.transactions.put({ ...local, syncState: 'conflict', updatedAt: Date.now() });
        });
      }
    }
  } finally { running = false; }
}

async function reschedule(item: OutboxItem) {
  if (item.id !== undefined) await db.outbox.update(item.id, { attempts: item.attempts + 1, nextAttemptAt: Date.now() + retryDelay(item.attempts) });
}

export function startSync() {
  window.addEventListener('online', () => void flushOutbox());
  window.addEventListener('focus', () => void flushOutbox());
  void flushOutbox();
}

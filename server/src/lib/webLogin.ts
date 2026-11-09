/**
 * Вход на сайте / в установленном приложении (вне Telegram):
 * сайт получает одноразовый nonce → открывает t.me/<бот>?start=login_<nonce>
 * → бот подтверждает, кто нажал Start → сайт забирает токен поллингом.
 */
import crypto from 'node:crypto';

interface Pending {
  userId: number | null;
  expires: number;
}
const pending = new Map<string, Pending>();

setInterval(() => {
  for (const [k, v] of pending) if (v.expires < Date.now()) pending.delete(k);
}, 60_000).unref();

export const botInfo = { username: '' };

export function createNonce() {
  const nonce = crypto.randomBytes(12).toString('base64url');
  pending.set(nonce, { userId: null, expires: Date.now() + 5 * 60_000 });
  return nonce;
}

/** вызывается ботом на /start login_<nonce> */
export function confirmNonce(nonce: string, userId: number) {
  const p = pending.get(nonce);
  if (!p || p.expires < Date.now()) return false;
  p.userId = userId;
  return true;
}

/** одноразово отдаёт userId, если вход подтверждён */
export function takeNonce(nonce: string): { status: 'pending' | 'expired' } | { status: 'ok'; userId: number } {
  const p = pending.get(nonce);
  if (!p || p.expires < Date.now()) return { status: 'expired' };
  if (!p.userId) return { status: 'pending' };
  pending.delete(nonce);
  return { status: 'ok', userId: p.userId };
}

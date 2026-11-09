import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { q, now, type Row } from './db.js';
import { signToken, verifyToken } from './lib/crypto.js';
import { isOnline } from './realtime.js';

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

/** Проверка подписи Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
export function validateInitData(initData: string): TgUser | null {
  if (!config.botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date') ?? 0) * 1000;
  if (Date.now() - authDate > 24 * 3600 * 1000) return null;
  try {
    return JSON.parse(params.get('user') ?? 'null');
  } catch {
    return null;
  }
}

function slugNick(base: string) {
  const s = base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
  return s.length >= 3 ? s : `user${Math.floor(Math.random() * 1e6)}`;
}

export function upsertUser(tg: TgUser): Row {
  const existing = q.get('SELECT * FROM users WHERE id = ?', tg.id);
  const t = now();
  const isAdmin = config.adminIds.includes(tg.id) ? 1 : 0;
  if (existing) {
    q.run(
      'UPDATE users SET username = ?, first_name = ?, last_seen = ?, is_admin = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
      tg.username ?? null,
      tg.first_name ?? null,
      t,
      isAdmin || existing.is_admin,
      tg.photo_url ?? null,
      tg.id,
    );
  } else {
    let nick = slugNick(tg.username || tg.first_name || '');
    while (q.get('SELECT 1 FROM users WHERE nickname = ?', nick)) nick = `${nick.slice(0, 16)}${Math.floor(Math.random() * 999)}`;
    q.run(
      `INSERT INTO users (id, username, first_name, nickname, avatar_url, is_admin, created_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      tg.id,
      tg.username ?? null,
      tg.first_name ?? null,
      nick,
      tg.photo_url ?? null,
      isAdmin,
      t,
      t,
    );
  }
  return q.get('SELECT * FROM users WHERE id = ?', tg.id)!;
}

export function issueToken(userId: number) {
  return signToken({ uid: userId, exp: Date.now() + 30 * 24 * 3600 * 1000 });
}

export function userFromToken(token: string | undefined): Row | null {
  if (!token) return null;
  const p = verifyToken<{ uid: number; exp: number }>(token);
  if (!p || p.exp < Date.now()) return null;
  return q.get('SELECT * FROM users WHERE id = ?', p.uid) ?? null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: Row;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization;
  const user = userFromToken(h?.startsWith('Bearer ') ? h.slice(7) : undefined);
  if (!user) return reply.code(401).send({ error: 'unauthorized' });
  req.user = user;
}

export function isPro(userId: number): boolean {
  const s = q.get<{ expires_at: number }>('SELECT expires_at FROM subscriptions WHERE user_id = ?', userId);
  return !!s && s.expires_at > Date.now();
}

export async function requirePro(req: FastifyRequest, reply: FastifyReply) {
  if (!isPro(req.user.id) && !req.user.is_admin) return reply.code(402).send({ error: 'subscription_required' });
}

export function publicUser(u: Row) {
  return {
    id: u.id,
    nickname: u.nickname,
    name: u.first_name,
    avatar: u.avatar_url,
    ring: u.ring,
    theme: u.theme,
    banner: u.banner,
    bio: u.bio,
    statusEmoji: u.status_emoji,
    customStatus: u.custom_status ?? '',
    bannerUrl: u.banner_url ?? null,
    bannerGrad: u.banner_grad ?? '',
    nickGrad: u.nick_grad ?? '',
    nickFont: u.nick_font ?? 'manrope',
    // статус как в Discord: online / idle / dnd, «невидимка» другим показывается как offline
    presence: presenceOf(u),
    pro: isPro(u.id),
    admin: !!u.is_admin,
    online: presenceOf(u) !== 'offline',
    createdAt: u.created_at,
  };
}

function presenceOf(u: Row): 'online' | 'idle' | 'dnd' | 'offline' {
  const connected = isOnline(u.id) || Date.now() - (u.last_seen ?? 0) < 2 * 60 * 1000;
  if (!connected || u.presence === 'invisible') return 'offline';
  return (['online', 'idle', 'dnd'].includes(u.presence) ? u.presence : 'online') as 'online' | 'idle' | 'dnd';
}

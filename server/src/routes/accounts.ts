import type { FastifyInstance } from 'fastify';
import { DEFAULT_TG_CHANNELS, PLATFORMS, type PlatformId } from '../config.js';
import { q, now } from '../db.js';
import { requireUser } from '../auth.js';
import { getText } from '../parsers/types.js';
import { confirmLogin, dropAccount, listDialogs, sendFromAccount, startLogin, tgUserEnabled } from '../lib/tgUser.js';

/**
 * У бирж (Kwork, FL, Freelance.ru, Pchel) нет открытого API для сторонних клиентов,
 * поэтому аккаунт привязывается по публичному профилю: проверяем, что он существует,
 * и показываем его в хабе + используем для быстрых откликов. Telegram — полноценная
 * MTProto-сессия (чтение своих чатов и ответы).
 */
const PROFILE_URL: Partial<Record<PlatformId, (h: string) => string>> = {
  kwork: (h) => `https://kwork.ru/user/${h}`,
  flru: (h) => `https://www.fl.ru/users/${h}/`,
  freelanceru: (h) => `https://freelance.ru/${h}`,
  pchel: (h) => `https://pchel.net/${h}/`,
};

function normalizeHandle(platform: PlatformId, input: string) {
  const s = input.trim();
  const patterns: Record<string, RegExp> = {
    kwork: /kwork\.ru\/user\/([\w.-]+)/i,
    flru: /fl\.ru\/users\/([\w.-]+)/i,
    freelanceru: /freelance\.ru\/([\w.-]+)/i,
    pchel: /pchel\.net\/([\w.-]+)/i,
  };
  const m = patterns[platform]?.exec(s);
  return (m ? m[1] : s).replace(/^@/, '').replace(/\/+$/, '');
}

const dto = (a: any) => ({
  id: a.id,
  platform: a.platform,
  handle: a.handle,
  profileUrl: a.profile_url,
  status: a.status,
  meta: JSON.parse(a.meta || '{}'),
  createdAt: a.created_at,
});

export async function accountRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/api/accounts', async (req) => ({
    items: q.all('SELECT * FROM linked_accounts WHERE user_id = ? ORDER BY created_at', req.user.id).map(dto),
    telegramLogin: tgUserEnabled(),
  }));

  app.post('/api/accounts', async (req, reply) => {
    const { platform, handle } = (req.body ?? {}) as { platform: PlatformId; handle: string };
    const mk = PROFILE_URL[platform];
    if (!mk || !handle) return reply.code(400).send({ error: 'Неизвестная площадка' });
    const h = normalizeHandle(platform, handle);
    if (!/^[\w.-]{2,40}$/.test(h)) return reply.code(400).send({ error: 'Некорректный логин' });
    const url = mk(h);
    let verified = false;
    try {
      await getText(url);
      verified = true;
    } catch {
      /* некоторые площадки режут ботов — сохраняем без проверки */
    }
    q.run(
      `INSERT INTO linked_accounts (user_id, platform, handle, profile_url, status, meta, created_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(user_id, platform, handle) DO UPDATE SET profile_url = excluded.profile_url, meta = excluded.meta`,
      req.user.id,
      platform,
      h,
      url,
      JSON.stringify({ verified, name: PLATFORMS[platform].name }),
      now(),
    );
    return dto(q.get('SELECT * FROM linked_accounts WHERE user_id = ? AND platform = ? AND handle = ?', req.user.id, platform, h));
  });

  app.delete('/api/accounts/:id', async (req, reply) => {
    const acc = q.get('SELECT * FROM linked_accounts WHERE id = ? AND user_id = ?', Number((req.params as any).id), req.user.id);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    if (acc.platform === 'telegram') await dropAccount(acc.id);
    q.run('DELETE FROM tg_sources WHERE account_id = ?', acc.id);
    q.run('DELETE FROM linked_accounts WHERE id = ?', acc.id);
    return { ok: true };
  });

  /* ───── Telegram-аккаунт ───── */
  app.post('/api/accounts/telegram/start', async (req, reply) => {
    const phone = String((req.body as any)?.phone ?? '').replace(/[^\d+]/g, '');
    if (phone.length < 10) return reply.code(400).send({ error: 'Введите номер в формате +7…' });
    try {
      return await startLogin(req.user.id, phone);
    } catch (e) {
      return reply.code(400).send({ error: (e as any).errorMessage ?? (e as Error).message });
    }
  });

  app.post('/api/accounts/telegram/confirm', async (req, reply) => {
    const { code, password } = (req.body ?? {}) as { code?: string; password?: string };
    try {
      return await confirmLogin(req.user.id, String(code ?? '').trim(), password);
    } catch (e) {
      return reply.code(400).send({ error: (e as any).errorMessage ?? (e as Error).message });
    }
  });

  const ownTg = (req: any) =>
    q.get("SELECT * FROM linked_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram'", Number(req.params.id), req.user.id);

  app.get('/api/accounts/:id/dialogs', async (req, reply) => {
    const acc = ownTg(req);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    try {
      return await listDialogs(acc.id);
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  app.post('/api/accounts/:id/sources', async (req, reply) => {
    const acc = ownTg(req);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    const { ref, title, enabled } = (req.body ?? {}) as { ref: string; title: string; enabled: boolean };
    q.run(
      `INSERT INTO tg_sources (user_id, account_id, ref, title, enabled) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, account_id, ref) DO UPDATE SET enabled = excluded.enabled, title = excluded.title`,
      req.user.id,
      acc.id,
      String(ref),
      String(title ?? ''),
      enabled ? 1 : 0,
    );
    return { ok: true };
  });

  app.post('/api/accounts/:id/send', async (req, reply) => {
    const acc = ownTg(req);
    if (!acc) return reply.code(404).send({ error: 'not_found' });
    const { to, text } = (req.body ?? {}) as { to: string; text: string };
    if (!to || !text?.trim()) return reply.code(400).send({ error: 'Пустое сообщение' });
    try {
      await sendFromAccount(acc.id, to, text.slice(0, 4000));
      return { ok: true };
    } catch (e) {
      return reply.code(502).send({ error: (e as any).errorMessage ?? (e as Error).message });
    }
  });

  /* ───── публичные TG-каналы парсера ───── */
  app.get('/api/sources/telegram', async () => {
    const custom = q.all('SELECT ref, enabled FROM tg_sources WHERE user_id IS NULL AND account_id IS NULL');
    const map = new Map<string, boolean>(DEFAULT_TG_CHANNELS.map((c) => [c, true]));
    for (const c of custom) map.set(c.ref, !!c.enabled);
    return [...map].map(([ref, enabled]) => ({ ref, enabled, builtIn: DEFAULT_TG_CHANNELS.includes(ref) }));
  });

  app.post('/api/sources/telegram', async (req, reply) => {
    if (!req.user.is_admin) return reply.code(403).send({ error: 'Только для админа' });
    const ref = String((req.body as any)?.ref ?? '')
      .trim()
      .replace(/^https?:\/\/t\.me\/(s\/)?/, '')
      .replace(/^@/, '');
    const enabled = (req.body as any)?.enabled !== false;
    if (!/^[a-zA-Z][\w]{3,31}$/.test(ref)) return reply.code(400).send({ error: 'Нужен @username публичного канала' });
    if (enabled) {
      const html = await getText(`https://t.me/s/${ref}`).catch(() => '');
      if (!html.includes('tgme_widget_message')) return reply.code(400).send({ error: 'У канала нет веб-превью (t.me/s/) — парсер его не прочитает' });
    }
    // NULL в UNIQUE не совпадает, поэтому обновляем вручную
    const ex = q.get('SELECT id FROM tg_sources WHERE user_id IS NULL AND account_id IS NULL AND ref = ?', ref);
    if (ex) q.run('UPDATE tg_sources SET enabled = ? WHERE id = ?', enabled ? 1 : 0, ex.id);
    else q.run('INSERT INTO tg_sources (user_id, account_id, ref, title, enabled) VALUES (NULL, NULL, ?, ?, ?)', ref, ref, enabled ? 1 : 0);
    return { ok: true };
  });
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config, PLATFORMS, type PlatformId } from '../config.js';
import { q, now } from '../db.js';
import { issueToken, isPro, publicUser, requirePro, requireUser, upsertUser, validateInitData } from '../auth.js';
import { leadDto, parsers } from '../parsers/index.js';
import { activateSubscription, createSubscriptionLink } from '../bot.js';
import { botInfo, createNonce, takeNonce } from '../lib/webLogin.js';

const RINGS = ['none', 'aurora', 'sunset', 'mint', 'mono', 'holo', 'fire', 'ice'];
const THEMES = ['violet', 'cyan', 'rose', 'lime', 'amber', 'silver'];
const BANNERS = ['nebula', 'waves', 'grid', 'prism', 'dusk', 'void'];
const NICK_FONTS = ['manrope', 'unbounded', 'mono', 'serif', 'script', 'pixel'];

/** Dev-режим: dev-пользователь = админ, плюс пара демо-юзеров, чтобы было с кем дружить и чатиться */
function seedDevUsers() {
  if (q.get('SELECT 1 FROM users WHERE id = 1')) return;
  const t = now();
  const demo: [number, string, string, string, string, string][] = [
    [101, 'kira_ui', 'Кира', 'sunset', 'rose', 'UI/UX · лендинги для beauty'],
    [102, 'max_tilda', 'Макс', 'mint', 'lime', 'Tilda Expert · Zero Block'],
    [103, 'nova_studio', 'Nova', 'holo', 'cyan', 'Студия веб-дизайна'],
  ];
  for (const [id, nick, name, ring, theme, bio] of demo)
    q.run(
      'INSERT OR IGNORE INTO users (id, username, first_name, nickname, ring, theme, bio, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?)',
      id, nick, name, nick, ring, theme, bio, t, t - id * 1000,
    );
  q.run(
    "INSERT INTO users (id, username, first_name, nickname, is_admin, created_at, last_seen) VALUES (1, 'designer', 'Dev', 'designer', 1, ?, ?)",
    t, t,
  );
  q.run("INSERT OR IGNORE INTO friendships VALUES (1, 101, 'accepted', ?), (101, 1, 'accepted', ?), (102, 1, 'pending', ?)", t, t, t);
}

export async function coreRoutes(app: FastifyInstance) {
  /* ───── вход ───── */
  app.post('/api/auth', async (req, reply) => {
    const { initData } = (req.body ?? {}) as { initData?: string };
    let tg = initData ? validateInitData(initData) : null;
    if (!tg && config.devAuth) {
      tg = { id: 1, username: 'designer', first_name: 'Dev' };
      seedDevUsers();
    }
    if (!tg) return reply.code(401).send({ error: 'bad_init_data' });
    const user = upsertUser(tg);
    return { token: issueToken(user.id), user: publicUser(user), devMode: config.devAuth };
  });

  /* ───── вход вне Telegram (сайт / PWA) через бота ───── */
  app.post('/api/auth/web/start', async (_req, reply) => {
    if (!botInfo.username) return reply.code(503).send({ error: 'Бот ещё не запущен' });
    const nonce = createNonce();
    return { nonce, link: `https://t.me/${botInfo.username}?start=login_${nonce}` };
  });

  app.get('/api/auth/web/poll', async (req) => {
    const r = takeNonce(String((req.query as any).nonce ?? ''));
    if (r.status !== 'ok') return r;
    const user = q.get('SELECT * FROM users WHERE id = ?', r.userId)!;
    return { status: 'ok', token: issueToken(user.id), user: publicUser(user) };
  });

  /* ───── профиль ───── */
  app.get('/api/me', { preHandler: requireUser }, async (req) => ({
    ...publicUser(req.user),
    notify: !!req.user.notify,
    aiPersona: req.user.ai_persona ?? '',
    presencePref: req.user.presence ?? 'online',
    options: { rings: RINGS, themes: THEMES, banners: BANNERS, fonts: NICK_FONTS },
  }));

  app.patch('/api/me', { preHandler: requireUser }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const u = req.user;
    if (b.nickname !== undefined) {
      const nick = String(b.nickname).trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(nick)) return reply.code(400).send({ error: 'Ник: 3–20 символов, латиница, цифры, _' });
      const taken = q.get('SELECT 1 FROM users WHERE nickname = ? AND id != ?', nick, u.id);
      if (taken) return reply.code(409).send({ error: 'Ник занят' });
      q.run('UPDATE users SET nickname = ? WHERE id = ?', nick, u.id);
    }
    if (b.statusEmoji !== undefined) q.run('UPDATE users SET status_emoji = ? WHERE id = ?', [...String(b.statusEmoji)].slice(0, 2).join(''), u.id);
    if (b.ring !== undefined && RINGS.includes(b.ring)) {
      const proOnly = ['holo', 'fire', 'ice'];
      if (proOnly.includes(b.ring) && !isPro(u.id) && !u.is_admin) return reply.code(402).send({ error: 'Эта обводка — для Pro' });
      q.run('UPDATE users SET ring = ? WHERE id = ?', b.ring, u.id);
    }
    if (b.theme !== undefined && THEMES.includes(b.theme)) q.run('UPDATE users SET theme = ? WHERE id = ?', b.theme, u.id);
    if (b.banner !== undefined && BANNERS.includes(b.banner)) q.run('UPDATE users SET banner = ? WHERE id = ?', b.banner, u.id);
    if (b.notify !== undefined) q.run('UPDATE users SET notify = ? WHERE id = ?', b.notify ? 1 : 0, u.id);
    // профиль в стиле Discord — бесплатно, без «нитро»
    const grad = (v: unknown) => {
      const parts = String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      return parts.length === 0 ? '' : parts.length <= 3 && parts.every((c) => /^#[0-9a-fA-F]{6}$/.test(c)) ? parts.join(',') : null;
    };
    if (b.bannerGrad !== undefined) {
      const g = grad(b.bannerGrad);
      if (g === null) return reply.code(400).send({ error: 'Градиент: 1–3 цвета #rrggbb' });
      q.run('UPDATE users SET banner_grad = ? WHERE id = ?', g, u.id);
    }
    if (b.nickGrad !== undefined) {
      const g = grad(b.nickGrad);
      if (g === null) return reply.code(400).send({ error: 'Градиент: 1–3 цвета #rrggbb' });
      q.run('UPDATE users SET nick_grad = ? WHERE id = ?', g, u.id);
    }
    if (b.nickFont !== undefined && NICK_FONTS.includes(b.nickFont)) q.run('UPDATE users SET nick_font = ? WHERE id = ?', b.nickFont, u.id);
    if (b.presence !== undefined && ['online', 'idle', 'dnd', 'invisible'].includes(b.presence)) q.run('UPDATE users SET presence = ? WHERE id = ?', b.presence, u.id);
    if (b.customStatus !== undefined) q.run('UPDATE users SET custom_status = ? WHERE id = ?', String(b.customStatus).slice(0, 60), u.id);
    if (b.bannerUrl === null) q.run('UPDATE users SET banner_url = NULL WHERE id = ?', u.id);
    if (b.bio !== undefined) q.run('UPDATE users SET bio = ? WHERE id = ?', String(b.bio).slice(0, 300), u.id);
    if (b.aiPersona !== undefined) q.run('UPDATE users SET ai_persona = ? WHERE id = ?', String(b.aiPersona).slice(0, 1500), u.id);
    const fresh = q.get('SELECT * FROM users WHERE id = ?', u.id)!;
    return { ...publicUser(fresh), notify: !!fresh.notify, aiPersona: fresh.ai_persona, presencePref: fresh.presence };
  });

  /** Загрузка картинки/GIF: аватар или фон профиля */
  const upload = (column: 'avatar_url' | 'banner_url', maxMb: number) => async (req: any, reply: any) => {
    const file = await req.file();
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return reply.code(400).send({ error: 'Нужна картинка или GIF' });
    const buf = await file.toBuffer();
    if (buf.length > maxMb * 1024 * 1024) return reply.code(413).send({ error: `До ${maxMb} МБ` });
    const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const name = `${req.user.id}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.dataDir, 'uploads', name), buf);
    q.run(`UPDATE users SET ${column} = ? WHERE id = ?`, `/uploads/${name}`, req.user.id);
    return { url: `/uploads/${name}`, avatar: `/uploads/${name}` };
  };
  app.post('/api/me/avatar', { preHandler: requireUser }, upload('avatar_url', 8));
  app.post('/api/me/banner', { preHandler: requireUser }, upload('banner_url', 12));

  app.get('/api/users/search', { preHandler: requireUser }, async (req) => {
    const s = String((req.query as any).q ?? '').trim().replace(/^@/, '');
    if (s.length < 2) return [];
    return q
      .all('SELECT * FROM users WHERE (nickname LIKE ? OR first_name LIKE ?) AND id != ? LIMIT 20', `${s}%`, `${s}%`, req.user.id)
      .map(publicUser);
  });

  app.get('/api/users/:id', { preHandler: requireUser }, async (req, reply) => {
    const u = q.get('SELECT * FROM users WHERE id = ?', Number((req.params as any).id));
    if (!u) return reply.code(404).send({ error: 'not_found' });
    const fr = q.get('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?', req.user.id, u.id);
    const back = q.get('SELECT * FROM friendships WHERE user_id = ? AND friend_id = ?', u.id, req.user.id);
    const friendship = fr?.status === 'accepted' ? 'friends' : fr ? 'outgoing' : back ? 'incoming' : 'none';
    const friends = q.get<{ n: number }>("SELECT count(*) n FROM friendships WHERE user_id = ? AND status = 'accepted'", u.id)!.n;
    return { ...publicUser(u), friendship, friends };
  });

  /* ───── площадки ───── */
  app.get('/api/platforms', { preHandler: requireUser }, async () => {
    const day = now() - 24 * 3600_000;
    return parsers.map((p) => {
      const st = q.get('SELECT * FROM platform_state WHERE platform = ?', p.id);
      const today = q.get<{ n: number }>('SELECT count(*) n FROM leads WHERE platform = ? AND fetched_at > ? AND owner_id IS NULL', p.id, day)!.n;
      return {
        id: p.id,
        ...PLATFORMS[p.id],
        enabled: p.enabled(),
        lastOk: st?.last_ok ?? null,
        lastError: st?.last_error ?? null,
        today,
      };
    });
  });

  /* ───── лента ───── */
  app.get('/api/leads/teaser', { preHandler: requireUser }, async () => {
    const day = now() - 24 * 3600_000;
    const total = q.get<{ n: number }>('SELECT count(*) n FROM leads WHERE owner_id IS NULL AND published_at > ?', day)!.n;
    const landing = q.get<{ n: number }>('SELECT count(*) n FROM leads WHERE owner_id IS NULL AND is_landing = 1 AND published_at > ?', day)!.n;
    const sample = q
      .all('SELECT * FROM leads WHERE owner_id IS NULL ORDER BY published_at DESC LIMIT 6')
      .map((r) => ({ ...leadDto(r), description: r.description.slice(0, 90), url: '', contact: null, authorUrl: null }));
    return { total, landing, sample };
  });

  app.get('/api/leads', { preHandler: [requireUser, requirePro] }, async (req) => {
    const qs = req.query as Record<string, string>;
    const where: string[] = ['(l.owner_id IS NULL OR l.owner_id = ?)', 'COALESCE(s.hidden, 0) = 0'];
    const params: any[] = [req.user.id, req.user.id];
    if (qs.platform && qs.platform in PLATFORMS) {
      where.push('l.platform = ?');
      params.push(qs.platform);
    }
    if (qs.landing === '1') where.push('l.is_landing = 1');
    // тип заказа: landing | design | dev (несколько через запятую — ИЛИ)
    if (qs.kind) {
      const map: Record<string, string> = { landing: 'l.is_landing = 1', design: 'l.is_design = 1', dev: 'l.is_dev = 1' };
      const parts = qs.kind.split(',').map((k) => map[k]).filter(Boolean);
      if (parts.length) where.push(`(${parts.join(' OR ')})`);
    }
    if (qs.hasBudget === '1') where.push("(l.budget_value IS NOT NULL OR (l.budget_text IS NOT NULL AND l.budget_text != 'Договорная'))");
    if (qs.hasContact === '1') where.push('l.contact IS NOT NULL');
    if (qs.today === '1') {
      where.push('l.published_at > ?');
      params.push(now() - 24 * 3600_000);
    }
    if (qs.saved === '1') where.push('s.saved = 1');
    if (qs.mine === '1') {
      where.push('l.owner_id = ?');
      params.push(req.user.id);
    }
    if (qs.minBudget) {
      where.push('l.budget_value >= ?');
      params.push(Number(qs.minBudget));
    }
    if (qs.q) {
      where.push('(l.title LIKE ? OR l.description LIKE ?)');
      params.push(`%${qs.q}%`, `%${qs.q}%`);
    }
    if (qs.before) {
      where.push('l.published_at < ?');
      params.push(Number(qs.before));
    }
    const rows = q.all(
      `SELECT l.*, s.saved, s.seen,
         EXISTS(SELECT 1 FROM responses r WHERE r.lead_id = l.id AND r.user_id = ?) AS in_responses
       FROM leads l
       LEFT JOIN lead_state s ON s.lead_id = l.id AND s.user_id = ?
       WHERE ${where.join(' AND ')} ORDER BY l.published_at DESC LIMIT 30`,
      req.user.id,
      ...params,
    );
    return { items: rows.map((r) => ({ ...leadDto(r), inResponses: !!r.in_responses })), next: rows.length === 30 ? rows[rows.length - 1].published_at : null };
  });

  app.post('/api/leads/:id/state', { preHandler: [requireUser, requirePro] }, async (req) => {
    const id = (req.params as any).id as string;
    const b = (req.body ?? {}) as { saved?: boolean; hidden?: boolean; seen?: boolean };
    q.run('INSERT OR IGNORE INTO lead_state (user_id, lead_id) VALUES (?, ?)', req.user.id, id);
    for (const k of ['saved', 'hidden', 'seen'] as const)
      if (b[k] !== undefined) q.run(`UPDATE lead_state SET ${k} = ? WHERE user_id = ? AND lead_id = ?`, b[k] ? 1 : 0, req.user.id, id);
    return { ok: true };
  });

  /* ───── подписка ───── */
  app.get('/api/billing', { preHandler: requireUser }, async (req) => {
    const s = q.get('SELECT * FROM subscriptions WHERE user_id = ?', req.user.id);
    return {
      pro: isPro(req.user.id),
      expiresAt: s?.expires_at ?? null,
      priceRub: config.priceRub,
      priceStars: config.priceStars,
      canSimulate: config.devAuth,
      botReady: !!config.botToken,
    };
  });

  app.post('/api/billing/invoice', { preHandler: requireUser }, async (req, reply) => {
    try {
      return { link: await createSubscriptionLink(req.user.id) };
    } catch (e) {
      return reply.code(503).send({ error: (e as Error).message });
    }
  });

  app.post('/api/billing/simulate', { preHandler: requireUser }, async (req, reply) => {
    if (!config.devAuth) return reply.code(403).send({ error: 'only_dev' });
    return { expiresAt: activateSubscription(req.user.id, null, 0) };
  });
}

export type { PlatformId };

import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { q, now, tx, type Row } from '../db.js';
import { publicUser, requireUser } from '../auth.js';
import { broadcast } from '../realtime.js';

const memberIds = (cid: number) =>
  q.all<{ user_id: number }>('SELECT user_id FROM conversation_members WHERE conversation_id = ?', cid).map((r) => r.user_id);

const isMember = (cid: number, uid: number) => !!q.get('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?', cid, uid);

const adminIds = () => {
  const ids = new Set(config.adminIds);
  for (const r of q.all<{ id: number }>('SELECT id FROM users WHERE is_admin = 1')) ids.add(r.id);
  return [...ids].filter((id) => q.get('SELECT 1 FROM users WHERE id = ?', id));
};

function msgDto(m: Row) {
  const sender = q.get('SELECT * FROM users WHERE id = ?', m.sender_id);
  return {
    id: m.id,
    conversationId: m.conversation_id,
    sender: sender ? publicUser(sender) : null,
    text: m.text,
    kind: m.kind,
    payload: m.payload ? JSON.parse(m.payload) : null,
    createdAt: m.created_at,
  };
}

function convDto(c: Row, uid: number) {
  const members = q
    .all('SELECT u.*, cm.role FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ?', c.id)
    .map((u) => ({ ...publicUser(u), role: u.role }));
  const me = q.get<{ last_read_id: number }>('SELECT last_read_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?', c.id, uid);
  const last = q.get('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1', c.id);
  const unread = q.get<{ n: number }>(
    'SELECT count(*) n FROM messages WHERE conversation_id = ? AND id > ? AND sender_id != ?',
    c.id,
    me?.last_read_id ?? 0,
    uid,
  )!.n;
  const peer = c.type === 'direct' ? members.find((m) => m.id !== uid) : null;
  return {
    id: c.id,
    type: c.type,
    title: c.type === 'direct' ? peer?.nickname ?? 'Диалог' : c.type === 'support' && members.find((m) => m.id === uid)?.role !== 'agent' ? 'Поддержка Lumen' : c.title,
    emoji: c.emoji,
    ownerId: c.owner_id,
    peer,
    members,
    lastMessage: last ? msgDto(last) : null,
    unread,
    updatedAt: c.updated_at,
  };
}

export function postMessage(cid: number, senderId: number, text: string, kind = 'text', payload: unknown = null) {
  const t = now();
  const r = q.run(
    'INSERT INTO messages (conversation_id, sender_id, text, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    cid,
    senderId,
    text,
    kind,
    payload ? JSON.stringify(payload) : null,
    t,
  );
  q.run('UPDATE conversations SET updated_at = ? WHERE id = ?', t, cid);
  q.run('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?', r.lastInsertRowid, cid, senderId);
  const m = msgDto(q.get('SELECT * FROM messages WHERE id = ?', r.lastInsertRowid)!);
  broadcast(memberIds(cid), 'message:new', m);
  return m;
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  /* ───── друзья ───── */
  app.get('/api/friends', async (req) => {
    const uid = req.user.id;
    const rows = (sql: string) => q.all(sql, uid).map(publicUser);
    return {
      friends: rows(
        "SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'accepted' ORDER BY u.last_seen DESC",
      ),
      incoming: rows("SELECT u.* FROM friendships f JOIN users u ON u.id = f.user_id WHERE f.friend_id = ? AND f.status = 'pending'"),
      outgoing: rows("SELECT u.* FROM friendships f JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? AND f.status = 'pending'"),
    };
  });

  app.post('/api/friends/:id', async (req, reply) => {
    const uid = req.user.id;
    const fid = Number((req.params as any).id);
    if (fid === uid || !q.get('SELECT 1 FROM users WHERE id = ?', fid)) return reply.code(400).send({ error: 'Нельзя' });
    const incoming = q.get("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'", fid, uid);
    tx(() => {
      if (incoming) {
        q.run("UPDATE friendships SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", fid, uid);
        q.run("INSERT OR REPLACE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?)", uid, fid, now());
      } else {
        q.run("INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)", uid, fid, now());
      }
    });
    broadcast([fid], 'friends:updated', { from: publicUser(req.user), accepted: !!incoming });
    return { status: incoming ? 'friends' : 'outgoing' };
  });

  app.delete('/api/friends/:id', async (req) => {
    const fid = Number((req.params as any).id);
    q.run('DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', req.user.id, fid, fid, req.user.id);
    broadcast([fid], 'friends:updated', {});
    return { ok: true };
  });

  /* ───── диалоги ───── */
  app.get('/api/conversations', async (req) => {
    const rows = q.all(
      `SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id
       WHERE m.user_id = ? ORDER BY c.updated_at DESC`,
      req.user.id,
    );
    return rows.map((c) => convDto(c, req.user.id));
  });

  app.post('/api/conversations/direct', async (req, reply) => {
    const uid = req.user.id;
    const peer = Number((req.body as any)?.userId);
    if (!peer || peer === uid || !q.get('SELECT 1 FROM users WHERE id = ?', peer)) return reply.code(400).send({ error: 'bad_user' });
    const key = [uid, peer].sort((a, b) => a - b).join(':');
    let c = q.get('SELECT * FROM conversations WHERE direct_key = ?', key);
    if (!c) {
      tx(() => {
        const r = q.run("INSERT INTO conversations (type, direct_key, created_at, updated_at) VALUES ('direct', ?, ?, ?)", key, now(), now());
        q.run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)', r.lastInsertRowid, uid, r.lastInsertRowid, peer);
      });
      c = q.get('SELECT * FROM conversations WHERE direct_key = ?', key)!;
    }
    return convDto(c, uid);
  });

  app.post('/api/conversations/group', async (req, reply) => {
    const uid = req.user.id;
    const { title, emoji, memberIds: ids } = (req.body ?? {}) as { title: string; emoji?: string; memberIds: number[] };
    const name = String(title ?? '').trim().slice(0, 48);
    if (!name) return reply.code(400).send({ error: 'Назовите группу' });
    const members = [...new Set((ids ?? []).map(Number))].filter((id) => id !== uid && q.get('SELECT 1 FROM users WHERE id = ?', id)).slice(0, 199);
    let cid = 0;
    tx(() => {
      const r = q.run("INSERT INTO conversations (type, title, emoji, owner_id, created_at, updated_at) VALUES ('group', ?, ?, ?, ?, ?)", name, emoji ?? '✦', uid, now(), now());
      cid = Number(r.lastInsertRowid);
      q.run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'owner')", cid, uid);
      for (const m of members) q.run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', cid, m);
    });
    postMessage(cid, uid, `${req.user.nickname} создал(а) группу «${name}»`, 'system');
    return convDto(q.get('SELECT * FROM conversations WHERE id = ?', cid)!, uid);
  });

  app.post('/api/conversations/:id/members', async (req, reply) => {
    const cid = Number((req.params as any).id);
    const c = q.get("SELECT * FROM conversations WHERE id = ? AND type = 'group'", cid);
    if (!c || !isMember(cid, req.user.id)) return reply.code(404).send({ error: 'not_found' });
    const ids = ((req.body as any)?.userIds ?? []).map(Number) as number[];
    for (const id of ids)
      if (q.get('SELECT 1 FROM users WHERE id = ?', id)) {
        q.run('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', cid, id);
      }
    postMessage(cid, req.user.id, `${req.user.nickname} добавил(а) участников: ${ids.length}`, 'system');
    return convDto(q.get('SELECT * FROM conversations WHERE id = ?', cid)!, req.user.id);
  });

  app.delete('/api/conversations/:id/members/me', async (req) => {
    const cid = Number((req.params as any).id);
    if (isMember(cid, req.user.id)) {
      postMessage(cid, req.user.id, `${req.user.nickname} покинул(а) чат`, 'system');
      q.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', cid, req.user.id);
    }
    return { ok: true };
  });

  /** Переименовать группу / сменить эмодзи (любой участник) */
  app.patch('/api/conversations/:id', async (req, reply) => {
    const cid = Number((req.params as any).id);
    const c = q.get("SELECT * FROM conversations WHERE id = ? AND type = 'group'", cid);
    if (!c || !isMember(cid, req.user.id)) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body ?? {}) as { title?: string; emoji?: string };
    const title = b.title !== undefined ? String(b.title).trim().slice(0, 48) : c.title;
    const emoji = b.emoji !== undefined ? String(b.emoji).slice(0, 8) : c.emoji;
    if (!title) return reply.code(400).send({ error: 'Название не может быть пустым' });
    q.run('UPDATE conversations SET title = ?, emoji = ?, updated_at = ? WHERE id = ?', title, emoji, now(), cid);
    if (title !== c.title) postMessage(cid, req.user.id, `${req.user.nickname} переименовал(а) группу в «${title}»`, 'system');
    return convDto(q.get('SELECT * FROM conversations WHERE id = ?', cid)!, req.user.id);
  });

  /** Исключить участника (только создатель группы) */
  app.delete('/api/conversations/:id/members/:userId', async (req, reply) => {
    const cid = Number((req.params as any).id);
    const target = Number((req.params as any).userId);
    const c = q.get("SELECT * FROM conversations WHERE id = ? AND type = 'group'", cid);
    if (!c || c.owner_id !== req.user.id) return reply.code(403).send({ error: 'Только создатель может исключать' });
    if (target === req.user.id) return reply.code(400).send({ error: 'Нельзя исключить себя' });
    const u = q.get('SELECT nickname FROM users WHERE id = ?', target);
    q.run('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', cid, target);
    if (u) postMessage(cid, req.user.id, `${req.user.nickname} исключил(а) ${u.nickname}`, 'system');
    return convDto(c, req.user.id);
  });

  app.get('/api/conversations/:id', async (req, reply) => {
    const cid = Number((req.params as any).id);
    if (!isMember(cid, req.user.id)) return reply.code(404).send({ error: 'not_found' });
    return convDto(q.get('SELECT * FROM conversations WHERE id = ?', cid)!, req.user.id);
  });

  app.get('/api/conversations/:id/messages', async (req, reply) => {
    const cid = Number((req.params as any).id);
    if (!isMember(cid, req.user.id)) return reply.code(404).send({ error: 'not_found' });
    const before = Number((req.query as any).before) || Number.MAX_SAFE_INTEGER;
    const rows = q.all('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT 50', cid, before);
    return rows.reverse().map(msgDto);
  });

  app.post('/api/conversations/:id/messages', async (req, reply) => {
    const cid = Number((req.params as any).id);
    if (!isMember(cid, req.user.id)) return reply.code(404).send({ error: 'not_found' });
    const { text, kind, payload } = (req.body ?? {}) as { text?: string; kind?: string; payload?: unknown };
    const body = String(text ?? '').trim().slice(0, 4000);
    if (kind === 'lead') return postMessage(cid, req.user.id, body, 'lead', payload);
    if (!body) return reply.code(400).send({ error: 'empty' });
    return postMessage(cid, req.user.id, body);
  });

  app.post('/api/conversations/:id/read', async (req) => {
    const cid = Number((req.params as any).id);
    const last = q.get<{ id: number }>('SELECT max(id) id FROM messages WHERE conversation_id = ?', cid);
    q.run('UPDATE conversation_members SET last_read_id = ? WHERE conversation_id = ? AND user_id = ?', last?.id ?? 0, cid, req.user.id);
    return { ok: true };
  });

  /* ───── поддержка ───── */
  app.post('/api/support', async (req) => {
    const uid = req.user.id;
    let c = q.get(
      "SELECT c.* FROM conversations c JOIN conversation_members m ON m.conversation_id = c.id WHERE c.type = 'support' AND c.owner_id = ? LIMIT 1",
      uid,
    );
    if (!c) {
      let cid = 0;
      tx(() => {
        const r = q.run("INSERT INTO conversations (type, title, emoji, owner_id, created_at, updated_at) VALUES ('support', ?, '🛟', ?, ?, ?)", `Поддержка · ${req.user.nickname}`, uid, now(), now());
        cid = Number(r.lastInsertRowid);
        q.run("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'client')", cid, uid);
        for (const a of adminIds()) if (a !== uid) q.run("INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'agent')", cid, a);
      });
      postMessage(cid, uid, 'Здравствуйте! Опишите вопрос — ответим в течение дня. Оплата, площадки, баги, идеи — всё сюда.', 'system');
      c = q.get('SELECT * FROM conversations WHERE id = ?', cid)!;
    }
    return convDto(c, uid);
  });
}

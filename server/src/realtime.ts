import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { userFromToken } from './auth.js';
import { q, now } from './db.js';

const sockets = new Map<number, Set<WebSocket>>();

export function sendTo(userId: number, type: string, data: unknown) {
  const set = sockets.get(userId);
  if (!set) return;
  const msg = JSON.stringify({ type, data });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
}

export function broadcast(userIds: Iterable<number>, type: string, data: unknown) {
  for (const id of userIds) sendTo(id, type, data);
}

export function onlineUserIds() {
  return [...sockets.keys()];
}

export function isOnline(userId: number) {
  return (sockets.get(userId)?.size ?? 0) > 0;
}

export async function registerRealtime(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token;
    const user = userFromToken(token);
    if (!user) {
      socket.close(4401, 'unauthorized');
      return;
    }
    const uid = user.id as number;
    if (!sockets.has(uid)) sockets.set(uid, new Set());
    sockets.get(uid)!.add(socket);
    q.run('UPDATE users SET last_seen = ? WHERE id = ?', now(), uid);

    socket.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw));
        if (m.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
        if (m.type === 'typing' && m.conversationId) {
          const members = q.all<{ user_id: number }>(
            'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?',
            m.conversationId,
            uid,
          );
          const isMember = q.get('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?', m.conversationId, uid);
          if (isMember) broadcast(members.map((x) => x.user_id), 'typing', { conversationId: m.conversationId, userId: uid });
        }
        // Звонки 1:1: сервер только пересылает сигналинг WebRTC (offer/answer/ice) между участниками личного чата
        if (typeof m.type === 'string' && m.type.startsWith('call:') && m.conversationId) {
          const conv = q.get(
            "SELECT c.id FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id WHERE c.id = ? AND c.type = 'direct' AND cm.user_id = ?",
            m.conversationId,
            uid,
          );
          if (!conv) return;
          const peer = q.get<{ user_id: number }>(
            'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id != ?',
            m.conversationId,
            uid,
          );
          if (!peer) return;
          const allowed = ['call:invite', 'call:accept', 'call:decline', 'call:end', 'call:signal', 'call:busy'];
          if (!allowed.includes(m.type)) return;
          if (m.type === 'call:invite' && !isOnline(peer.user_id)) {
            socket.send(JSON.stringify({ type: 'call:unavailable', data: { conversationId: m.conversationId } }));
            return;
          }
          const from = q.get('SELECT id, nickname, avatar_url, ring FROM users WHERE id = ?', uid);
          sendTo(peer.user_id, m.type, {
            conversationId: m.conversationId,
            callId: m.callId,
            from: { id: uid, nickname: from?.nickname, avatar: from?.avatar_url, ring: from?.ring },
            video: !!m.video,
            signal: m.signal,
          });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on('close', () => {
      sockets.get(uid)?.delete(socket);
      if (!sockets.get(uid)?.size) sockets.delete(uid);
      q.run('UPDATE users SET last_seen = ? WHERE id = ?', now(), uid);
    });
  });
}

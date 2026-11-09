/**
 * Автоотклик (Pro): исполнитель складывает заказы в «корзину откликов»,
 * жмёт одну кнопку — ИИ пишет каждому заказчику короткий отклик по его инструкции.
 * Отправка: Telegram-заказчикам — от привязанного TG-аккаунта (по одному, с паузами);
 * на биржах (Kwork, FL…) API для откликов нет — текст готов, остаётся «скопировать и открыть».
 */
import type { FastifyInstance } from 'fastify';
import { q, now, type Row } from '../db.js';
import { requirePro, requireUser } from '../auth.js';
import { leadDto } from '../parsers/index.js';
import { sendTo } from '../realtime.js';
import { aiReady, writeReply } from '../lib/ai.js';
import { sendFromAccount, tgUserEnabled } from '../lib/tgUser.js';

const MAX_PER_RUN = 20;
const running = new Set<number>();

const tgContact = (lead: Row) =>
  String(lead.contact ?? '')
    .split(',')
    .map((s) => s.trim())
    .find((s) => /^@[a-zA-Z][\w]{4,31}$/.test(s)) ?? null;

const tgAccount = (userId: number) =>
  q.get("SELECT * FROM linked_accounts WHERE user_id = ? AND platform = 'telegram' AND status = 'active' LIMIT 1", userId);

function itemDto(r: Row, userId: number) {
  const lead = q.get('SELECT * FROM leads WHERE id = ?', r.lead_id);
  return {
    leadId: r.lead_id,
    status: r.status,
    text: r.text,
    channel: r.channel,
    error: r.error,
    to: lead ? tgContact(lead) : null,
    canAutoSend: !!(lead && tgContact(lead) && tgAccount(userId) && tgUserEnabled()),
    lead: lead ? leadDto(lead) : null,
    updatedAt: r.updated_at,
  };
}

function setItem(userId: number, leadId: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  q.run(
    `UPDATE responses SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE user_id = ? AND lead_id = ?`,
    ...keys.map((k) => patch[k] as any),
    now(),
    userId,
    leadId,
  );
  const row = q.get('SELECT * FROM responses WHERE user_id = ? AND lead_id = ?', userId, leadId);
  if (row) sendTo(userId, 'responses:update', itemDto(row, userId));
}

async function runQueue(userId: number) {
  running.add(userId);
  try {
    const user = q.get('SELECT * FROM users WHERE id = ?', userId)!;
    const items = q.all(
      "SELECT * FROM responses WHERE user_id = ? AND status IN ('queued', 'failed') ORDER BY created_at LIMIT ?",
      userId,
      MAX_PER_RUN,
    );
    const acc = tgUserEnabled() ? tgAccount(userId) : null;

    // 1) генерируем тексты (по 3 параллельно)
    for (let i = 0; i < items.length; i += 3) {
      await Promise.all(
        items.slice(i, i + 3).map(async (it) => {
          const lead = q.get('SELECT * FROM leads WHERE id = ?', it.lead_id);
          if (!lead) return setItem(userId, it.lead_id, { status: 'failed', error: 'Заказ удалён' });
          setItem(userId, it.lead_id, { status: 'generating', error: null });
          try {
            const text = await writeReply(lead, user.ai_persona ?? '');
            const auto = !!(acc && tgContact(lead));
            setItem(userId, it.lead_id, { status: 'ready', text, channel: auto ? 'telegram' : 'manual' });
          } catch (e) {
            setItem(userId, it.lead_id, { status: 'failed', error: (e as Error).message.slice(0, 200) });
          }
        }),
      );
    }

    // 2) Telegram-заказчикам отправляем сами — по одному, с паузой, чтобы не словить спам-блок
    if (acc) {
      const ready = q.all("SELECT * FROM responses WHERE user_id = ? AND status = 'ready' AND channel = 'telegram'", userId);
      for (const [i, it] of ready.entries()) {
        const lead = q.get('SELECT * FROM leads WHERE id = ?', it.lead_id);
        const to = lead && tgContact(lead);
        if (!to) continue;
        if (i > 0) await new Promise((r) => setTimeout(r, 25_000 + Math.random() * 20_000));
        // пока ждали паузу, человек мог отправить сам или удалить из корзины
        const still = q.get("SELECT 1 FROM responses WHERE user_id = ? AND lead_id = ? AND status = 'ready'", userId, it.lead_id);
        if (!still) continue;
        try {
          await sendFromAccount(acc.id, to, it.text);
          setItem(userId, it.lead_id, { status: 'sent' });
        } catch (e) {
          setItem(userId, it.lead_id, { status: 'failed', error: (e as any).errorMessage ?? (e as Error).message });
        }
      }
    }
  } finally {
    running.delete(userId);
    sendTo(userId, 'responses:done', {});
  }
}

export async function responseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);
  app.addHook('preHandler', requirePro);

  app.get('/api/responses', async (req) => ({
    items: q.all('SELECT * FROM responses WHERE user_id = ? ORDER BY created_at DESC', req.user.id).map((r) => itemDto(r, req.user.id)),
    persona: req.user.ai_persona ?? '',
    running: running.has(req.user.id),
    aiReady: aiReady(),
    telegramLinked: !!tgAccount(req.user.id),
  }));

  app.post('/api/responses', async (req, reply) => {
    const leadId = String((req.body as any)?.leadId ?? '');
    const lead = q.get('SELECT id FROM leads WHERE id = ? AND (owner_id IS NULL OR owner_id = ?)', leadId, req.user.id);
    if (!lead) return reply.code(404).send({ error: 'Заказ не найден' });
    q.run(
      "INSERT INTO responses (user_id, lead_id, status, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?) ON CONFLICT DO NOTHING",
      req.user.id,
      leadId,
      now(),
      now(),
    );
    return itemDto(q.get('SELECT * FROM responses WHERE user_id = ? AND lead_id = ?', req.user.id, leadId)!, req.user.id);
  });

  app.delete('/api/responses/:leadId', async (req) => {
    q.run('DELETE FROM responses WHERE user_id = ? AND lead_id = ?', req.user.id, (req.params as any).leadId);
    return { ok: true };
  });

  app.delete('/api/responses', async (req) => {
    q.run("DELETE FROM responses WHERE user_id = ? AND status = 'sent'", req.user.id);
    return { ok: true };
  });

  app.patch('/api/responses/:leadId', async (req) => {
    const b = (req.body ?? {}) as { text?: string; status?: string };
    const patch: Record<string, unknown> = {};
    if (b.text !== undefined) patch.text = String(b.text).slice(0, 4000);
    if (b.status === 'sent') patch.status = 'sent'; // «отправил вручную»
    if (Object.keys(patch).length) setItem(req.user.id, (req.params as any).leadId, patch);
    return { ok: true };
  });

  /** Большая кнопка «Откликнуться» */
  app.post('/api/responses/run', async (req, reply) => {
    if (running.has(req.user.id)) return reply.code(409).send({ error: 'Уже работаю над откликами' });
    const n = q.get<{ n: number }>("SELECT count(*) n FROM responses WHERE user_id = ? AND status IN ('queued','failed')", req.user.id)!.n;
    if (!n) return reply.code(400).send({ error: 'Корзина пуста — добавьте заказы из ленты' });
    runQueue(req.user.id); // в фоне, прогресс летит по WebSocket
    return { started: Math.min(n, MAX_PER_RUN) };
  });

  /** Отправить один готовый отклик через Telegram */
  app.post('/api/responses/:leadId/send', async (req, reply) => {
    const leadId = (req.params as any).leadId;
    const it = q.get('SELECT * FROM responses WHERE user_id = ? AND lead_id = ?', req.user.id, leadId);
    const lead = q.get('SELECT * FROM leads WHERE id = ?', leadId);
    const acc = tgAccount(req.user.id);
    const to = lead && tgContact(lead);
    if (!it || !it.text) return reply.code(400).send({ error: 'Сначала сгенерируйте отклик' });
    if (!acc || !to) return reply.code(400).send({ error: 'Нужен привязанный Telegram и @username заказчика' });
    try {
      await sendFromAccount(acc.id, to, it.text);
      setItem(req.user.id, leadId, { status: 'sent', channel: 'telegram' });
      return { ok: true };
    } catch (e) {
      return reply.code(502).send({ error: (e as any).errorMessage ?? (e as Error).message });
    }
  });
}

import type { PlatformId } from '../config.js';
import { q, now, tx, type Row } from '../db.js';
import { broadcast, onlineUserIds } from '../realtime.js';
import { isPro } from '../auth.js';
import { flru } from './flru.js';
import { freelanceru } from './freelanceru.js';
import { kwork } from './kwork.js';
import { pchel } from './pchel.js';
import { RELEVANT_THRESHOLD, kindOf, scoreLead } from './relevance.js';
import { telegram } from './telegram.js';
import { twogis } from './twogis.js';
import type { Parser, RawLead } from './types.js';

export const parsers: Parser[] = [kwork, flru, freelanceru, pchel, telegram, twogis];

export function leadDto(r: Row) {
  return {
    id: r.id,
    platform: r.platform,
    title: r.title,
    description: r.description,
    budgetText: r.budget_text,
    budgetValue: r.budget_value,
    url: r.url,
    author: r.author,
    authorUrl: r.author_url,
    contact: r.contact,
    category: r.category,
    source: r.source,
    score: r.score,
    isLanding: !!r.is_landing,
    isDesign: !!r.is_design,
    isDev: !!r.is_dev,
    personal: r.owner_id != null,
    publishedAt: r.published_at,
    saved: !!r.saved,
    seen: !!r.seen,
  };
}

type Listener = (leads: Row[]) => void;
const listeners: Listener[] = [];
/** bot.ts подписывается, чтобы слать пуши о лендингах */
export const onNewLeads = (fn: Listener) => listeners.push(fn);

/** Записывает новые релевантные лиды, возвращает только впервые увиденные */
export function ingest(platform: PlatformId, raws: RawLead[]): Row[] {
  const fresh: Row[] = [];
  const t = now();
  tx(() => {
    for (const r of raws) {
      const id = `${platform}:${r.extId}`;
      if (q.get('SELECT 1 FROM leads WHERE id = ?', id)) continue;
      if (t - r.publishedAt > 30 * 24 * 3600_000) continue; // старьё не тащим
      const { score, isLanding } = scoreLead(r.title, r.description);
      if (!r.forceRelevant && score < RELEVANT_THRESHOLD) continue;
      // слишком старое (напр. первая загрузка канала) — пишем, но не пушим
      const isOld = t - r.publishedAt > 3 * 24 * 3600_000;
      q.run(
        `INSERT INTO leads (id, platform, title, description, budget_text, budget_value, url, author, author_url,
           contact, category, source, owner_id, score, is_landing, published_at, fetched_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id,
        platform,
        r.title.slice(0, 300),
        r.description.slice(0, 6000),
        r.budgetText ?? null,
        r.budgetValue ?? null,
        r.url,
        r.author ?? null,
        r.authorUrl ?? null,
        r.contact ?? null,
        r.category ?? null,
        r.source ?? null,
        r.ownerId ?? null,
        r.forceRelevant ? Math.max(score, RELEVANT_THRESHOLD) : score,
        isLanding ? 1 : 0,
        Math.min(r.publishedAt, t),
        t,
      );
      if (!isOld) fresh.push(q.get('SELECT * FROM leads WHERE id = ?', id)!);
    }
  });

  if (fresh.length) {
    const publicLeads = fresh.filter((l) => l.owner_id == null);
    const recipients = onlineUserIds().filter((id) => isPro(id) || q.get('SELECT 1 FROM users WHERE id = ? AND is_admin = 1', id));
    if (publicLeads.length) broadcast(recipients, 'leads:new', publicLeads.map(leadDto));
    for (const l of fresh.filter((l) => l.owner_id != null)) broadcast([l.owner_id], 'leads:new', [leadDto(l)]);
    for (const fn of listeners) fn(fresh);
  }
  return fresh;
}

export async function runParser(p: Parser) {
  const t = now();
  try {
    const raws = await p.fetch();
    const fresh = ingest(p.id, raws);
    q.run(
      `INSERT INTO platform_state (platform, last_run, last_ok, last_error, items) VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(platform) DO UPDATE SET last_run = excluded.last_run, last_ok = excluded.last_ok, last_error = NULL, items = items + excluded.items`,
      p.id,
      t,
      t,
      fresh.length,
    );
    console.log(`[parser] ${p.id}: fetched ${raws.length}, new relevant ${fresh.length}`);
    return { fetched: raws.length, fresh: fresh.length };
  } catch (e) {
    const msg = (e as Error).message;
    q.run(
      `INSERT INTO platform_state (platform, last_run, last_error) VALUES (?, ?, ?)
       ON CONFLICT(platform) DO UPDATE SET last_run = excluded.last_run, last_error = excluded.last_error`,
      p.id,
      t,
      msg.slice(0, 500),
    );
    console.warn(`[parser] ${p.id} failed:`, msg);
    return { fetched: 0, fresh: 0, error: msg };
  }
}

export function startScheduler() {
  parsers.forEach((p, i) => {
    if (!p.enabled()) {
      console.log(`[parser] ${p.id}: disabled (нет ключа/настроек)`);
      return;
    }
    const loop = async () => {
      await runParser(p);
      setTimeout(loop, p.intervalMs + Math.random() * 30_000);
    };
    // разносим старт, чтобы не долбить сеть одновременно
    setTimeout(loop, 1500 + i * 4000);
  });
}

/** Проставляет типы старым заказам (после миграции) */
export function backfillKinds() {
  const rows = q.all<{ id: string; title: string; description: string }>('SELECT id, title, description FROM leads WHERE is_design IS NULL');
  for (const r of rows) {
    const k = kindOf(r.title, r.description);
    q.run('UPDATE leads SET is_design = ?, is_dev = ? WHERE id = ?', k.isDesign ? 1 : 0, k.isDev ? 1 : 0, r.id);
  }
}

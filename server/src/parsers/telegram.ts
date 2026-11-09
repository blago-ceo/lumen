import * as cheerio from 'cheerio';
import { DEFAULT_TG_CHANNELS } from '../config.js';
import { q } from '../db.js';
import { clean, getText, parseBudget, sleep, type Parser, type RawLead } from './types.js';

/** Достаём контакты заказчика из текста поста */
export function extractContact(text: string): string | null {
  const found = new Set<string>();
  for (const m of text.matchAll(/(?:^|[\s(])@([a-zA-Z][a-zA-Z0-9_]{4,31})/g)) found.add('@' + m[1]);
  for (const m of text.matchAll(/t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,31})(?![/\w])/g)) found.add('@' + m[1]);
  for (const m of text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)) found.add(m[0]);
  return found.size ? [...found].slice(0, 3).join(', ') : null;
}

export function budgetFromText(text: string): { budgetText: string | null; budgetValue: number | null } {
  const m = text.match(/(бюджет|оплата|цена|стоимость|гонорар)[:\s—-]*([^\n]{2,60})/i);
  if (m) return { budgetText: clean(m[2]), budgetValue: parseBudget(m[2]) };
  const r = text.match(/(\d[\d\s]{2,8})\s?(₽|руб|р\.|k|к)\b/i);
  return r ? { budgetText: clean(r[0]), budgetValue: parseBudget(r[0]) } : { budgetText: null, budgetValue: null };
}

export function titleFromText(text: string) {
  const first = text.split('\n').map((s) => s.replace(/^(#[\p{L}\w]+\s*)+/u, '').replace(/^[\s\p{Extended_Pictographic}️•—-]+/u, '').trim()).find((s) => s.length > 8) ?? text;
  return first.length > 110 ? first.slice(0, 107).trimEnd() + '…' : first;
}

export function postToLead(text: string, opts: Omit<RawLead, 'title' | 'description' | 'contact' | 'budgetText' | 'budgetValue'>): RawLead {
  return {
    ...opts,
    title: titleFromText(text),
    description: text,
    contact: extractContact(text),
    ...budgetFromText(text),
  };
}

/** Каналы = дефолтные + добавленные админом (tg_sources с user_id IS NULL) */
function channels(): string[] {
  const extra = q.all<{ ref: string }>('SELECT ref FROM tg_sources WHERE user_id IS NULL AND account_id IS NULL AND enabled = 1');
  const disabled = new Set(
    q.all<{ ref: string }>('SELECT ref FROM tg_sources WHERE user_id IS NULL AND account_id IS NULL AND enabled = 0').map((r) => r.ref),
  );
  return [...new Set([...DEFAULT_TG_CHANNELS, ...extra.map((e) => e.ref)])].filter((c) => !disabled.has(c));
}

/** Публичные каналы читаем через веб-превью t.me/s/<channel> — аккаунт не нужен */
export const telegram: Parser = {
  id: 'telegram',
  intervalMs: 3 * 60_000,
  enabled: () => true,
  async fetch() {
    const out: RawLead[] = [];
    for (const ch of channels()) {
      try {
        const html = await getText(`https://t.me/s/${ch}`);
        const $ = cheerio.load(html);
        $('.tgme_widget_message[data-post]').each((_, el) => {
          const msg = $(el);
          const post = msg.attr('data-post')!;
          const textEl = msg.find('.tgme_widget_message_text').first();
          textEl.find('br').replaceWith('\n');
          const text = clean(textEl.text());
          if (text.length < 30) return;
          const dt = msg.find('.tgme_widget_message_date time').attr('datetime');
          out.push(
            postToLead(text, {
              extId: post,
              url: `https://t.me/${post}`,
              author: '@' + ch,
              authorUrl: `https://t.me/${ch}`,
              category: 'Telegram-канал',
              source: '@' + ch,
              publishedAt: dt ? Date.parse(dt) : Date.now(),
            }),
          );
        });
      } catch (e) {
        console.warn('[telegram]', ch, (e as Error).message);
      }
      await sleep(700);
    }
    return out;
  },
};

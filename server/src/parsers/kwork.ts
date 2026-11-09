import { clean, getText, sleep, type Parser, type RawLead } from './types.js';

/** 15 — «Дизайн», 37 — «Разработка сайтов» */
const CATEGORIES = [37, 15];

function extractStateData(html: string): any {
  const i = html.indexOf('window.stateData=');
  if (i < 0) throw new Error('kwork: stateData not found');
  const s = html.indexOf('{', i);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = s; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(s, j + 1));
  }
  throw new Error('kwork: stateData unterminated');
}

/** Kwork отдаёт время по Москве без зоны */
const msk = (s: string) => Date.parse(s.replace(' ', 'T') + '+03:00') || Date.now();

export const kwork: Parser = {
  id: 'kwork',
  intervalMs: 4 * 60_000,
  enabled: () => true,
  async fetch() {
    const out: RawLead[] = [];
    for (const c of CATEGORIES) {
      for (const page of [1, 2]) {
        const html = await getText(`https://kwork.ru/projects?c=${c}&page=${page}`);
        const wants: any[] = extractStateData(html)?.wantsListData?.wants ?? [];
        for (const w of wants) {
          const price = Number(w.priceLimit) || null;
          const upTo = Number(w.possiblePriceLimit) || null;
          out.push({
            extId: String(w.id),
            title: clean(w.name),
            description: clean(w.description),
            url: `https://kwork.ru/projects/${w.id}/view`,
            budgetValue: price ? Math.round(price) : null,
            budgetText: price ? `до ${Math.round(price).toLocaleString('ru-RU')} ₽${upTo && upTo > price ? ` (допустимо ${upTo.toLocaleString('ru-RU')} ₽)` : ''}` : null,
            author: w.user?.username ?? null,
            authorUrl: w.wantUserGetProfileUrl ?? null,
            category: c === 37 ? 'Разработка сайтов' : 'Дизайн',
            source: `kwork/c${c}`,
            publishedAt: msk(w.date_create ?? w.date_active),
          });
        }
        await sleep(1200);
      }
    }
    return out;
  },
};

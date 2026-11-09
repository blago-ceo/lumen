import * as cheerio from 'cheerio';
import { clean, getText, parseBudget, sleep, type Parser, type RawLead } from './types.js';

/** "09.11.2026 13:03" по Москве */
function parseDate(s: string | undefined) {
  const m = s?.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return Date.now();
  return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+03:00`);
}

export const freelanceru: Parser = {
  id: 'freelanceru',
  intervalMs: 6 * 60_000,
  enabled: () => true,
  async fetch() {
    const out: RawLead[] = [];
    for (const page of [1, 2, 3]) {
      const html = await getText(`https://freelance.ru/project/search/pro?page=${page}`);
      const $ = cheerio.load(html);
      $('article.task-card').each((_, el) => {
        const card = $(el);
        const a = card.find('a.task-card__title-link');
        const href = a.attr('href') ?? '';
        const id = href.match(/\/task\/view\/(\d+)/)?.[1];
        if (!id) return;
        const budgetText = clean(card.find('.task-card__budget').text()) || null;
        out.push({
          extId: id,
          title: clean(a.attr('title') || a.text()),
          description: clean(card.find('.task-card__desc').text()),
          url: new URL(href, 'https://freelance.ru').toString(),
          budgetText,
          budgetValue: parseBudget(budgetText),
          category: clean(card.find('.task-chip--cat').first().text()) || null,
          source: 'freelance.ru',
          publishedAt: parseDate(card.find('.task-card__foot-item[title]').first().attr('title')),
        });
      });
      await sleep(1000);
    }
    return out;
  },
};

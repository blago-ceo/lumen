import * as cheerio from 'cheerio';
import { clean, getText, parseBudget, sleep, type Parser, type RawLead } from './types.js';

/** RSS-ленты FL.ru: 3 — Дизайн, 2 — Разработка сайтов */
const FEEDS = [
  { cat: 3, name: 'Дизайн' },
  { cat: 2, name: 'Сайты' },
];

export const flru: Parser = {
  id: 'flru',
  intervalMs: 5 * 60_000,
  enabled: () => true,
  async fetch() {
    const out: RawLead[] = [];
    for (const f of FEEDS) {
      const xml = await getText(`https://www.fl.ru/rss/all.xml?category=${f.cat}`);
      const $ = cheerio.load(xml, { xml: true });
      $('item').each((_, el) => {
        const it = $(el);
        const rawTitle = clean(it.find('title').text());
        const link = it.find('link').text().trim();
        const id = link.match(/projects\/(\d+)/)?.[1];
        if (!id) return;
        const budgetMatch = rawTitle.match(/\(Бюджет:\s*([^)]+)\)\s*$/);
        const budgetText = budgetMatch ? cheerio.load(budgetMatch[1]).text().replace(/\s+/g, ' ').trim() : null;
        const descHtml = it.find('description').text();
        out.push({
          extId: id,
          title: rawTitle.replace(/\(Бюджет:[^)]+\)\s*$/, '').trim(),
          description: clean(cheerio.load(descHtml).text()).replace(/^Бюджет:[^\n]*\n+/, ''),
          url: link,
          budgetText,
          budgetValue: parseBudget(budgetText),
          category: clean(it.find('category').text()) || f.name,
          source: `fl/${f.cat}`,
          publishedAt: Date.parse(it.find('pubDate').text()) || Date.now(),
        });
      });
      await sleep(800);
    }
    return out;
  },
};

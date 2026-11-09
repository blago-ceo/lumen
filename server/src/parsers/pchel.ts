import * as cheerio from 'cheerio';
import { clean, getText, parseBudget, sleep, type Parser, type RawLead } from './types.js';

const CATEGORIES = ['web-design', 'website-development', 'turnkey-websites', 'website-layout'];

export const pchel: Parser = {
  id: 'pchel',
  intervalMs: 7 * 60_000,
  enabled: () => true,
  async fetch() {
    const out: RawLead[] = [];
    const fetchedAt = Date.now();
    for (const [i, cat] of CATEGORIES.entries()) {
      const html = await getText(`https://pchel.net/jobs/${cat}/`);
      const $ = cheerio.load(html);
      $('.project-block').each((idx, el) => {
        const card = $(el);
        const id = card.find('input[name="project_id"]').attr('value');
        const a = card.find('.project-title a').first();
        if (!id || !a.length) return;
        const rawBudget = clean(card.find('.project-athor .price').text().replace('Бюджет:', ''));
        const budgetText = /договор/i.test(rawBudget) ? 'Договорная' : rawBudget || null;
        out.push({
          extId: id,
          title: clean(a.text()),
          description: clean(card.find('.project-text').text()),
          url: new URL(a.attr('href') ?? '', 'https://pchel.net').toString(),
          budgetText,
          // pchel показывает бюджет в $, конвертацию не выдумываем — только текст
          budgetValue: budgetText?.includes('$') ? null : parseBudget(budgetText),
          category: clean(card.find('.project-tags a').last().text()) || null,
          source: `pchel/${cat}`,
          // на листинге только относительная дата → сохраняем порядок выдачи
          publishedAt: fetchedAt - (i * 100 + idx) * 60_000,
        });
      });
      await sleep(900);
    }
    return out;
  },
};

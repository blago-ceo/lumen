import { config } from '../config.js';
import { getText, sleep, type Parser, type RawLead } from './types.js';

/**
 * 2ГИС — не биржа, а каталог компаний. Лид = компания в нише, у которой
 * в карточке НЕТ сайта → ей можно предложить лендинг (холодный клиент).
 * Нужен ключ Places API (TWOGIS_KEY).
 */
export const twogis: Parser = {
  id: 'twogis',
  intervalMs: 6 * 3600_000,
  enabled: () => !!config.twogisKey,
  async fetch() {
    const out: RawLead[] = [];
    for (const [city, query] of config.twogisQueries) {
      for (const page of [1, 2, 3]) {
        const url = new URL('https://catalog.api.2gis.com/3.0/items');
        url.searchParams.set('q', `${query} ${city}`);
        url.searchParams.set('type', 'branch');
        url.searchParams.set('fields', 'items.contact_groups,items.rubrics,items.address,items.reviews,items.full_address_name');
        url.searchParams.set('page_size', '10');
        url.searchParams.set('page', String(page));
        url.searchParams.set('key', config.twogisKey);
        const json = JSON.parse(await getText(url.toString()));
        if (json?.meta?.code !== 200) {
          if (json?.meta?.code === 404) break; // кончились результаты
          throw new Error(`2gis: ${json?.meta?.error?.message ?? json?.meta?.code}`);
        }
        for (const it of json.result?.items ?? []) {
          const contacts: { type: string; value?: string; text?: string }[] = (it.contact_groups ?? []).flatMap(
            (g: any) => g.contacts ?? [],
          );
          const hasSite = contacts.some((c) => c.type === 'website');
          if (hasSite) continue;
          const phone = contacts.find((c) => c.type === 'phone');
          const socials = contacts.filter((c) => ['instagram', 'vkontakte', 'telegram', 'whatsapp'].includes(c.type));
          const rating = it.reviews?.general_rating;
          const reviews = it.reviews?.general_review_count;
          const rubrics = (it.rubrics ?? []).map((r: any) => r.name).join(', ');
          out.push({
            extId: String(it.id).split('_')[0],
            title: `Нет сайта: ${it.name}`,
            description: [
              `${rubrics || query} · ${city}`,
              it.full_address_name || it.address_name,
              rating ? `Рейтинг ${rating} (${reviews ?? 0} отзывов) — живой бизнес без сайта` : 'В карточке 2ГИС нет сайта',
              socials.length ? `Соцсети: ${socials.map((s) => s.text || s.value).join(', ')}` : '',
              'Холодный лид: предложите лендинг под их нишу.',
            ]
              .filter(Boolean)
              .join('\n'),
            url: `https://2gis.ru/firm/${String(it.id).split('_')[0]}`,
            contact: phone?.text || phone?.value || socials[0]?.value || null,
            category: rubrics || query,
            source: `2gis/${city}`,
            publishedAt: Date.now(),
            forceRelevant: true,
          });
        }
        await sleep(600);
      }
    }
    return out;
  },
};

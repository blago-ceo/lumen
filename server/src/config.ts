import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  root,
  dataDir: path.join(root, 'data'),
  webDist: path.join(root, 'web', 'dist'),
  port: num(process.env.PORT, 8787),
  botToken: process.env.BOT_TOKEN ?? '',
  webappUrl: process.env.WEBAPP_URL ?? '',
  adminIds: (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  priceRub: num(process.env.PRICE_RUB, 270),
  priceStars: num(process.env.PRICE_STARS, 180),
  secret: process.env.APP_SECRET || 'dev-secret-change-me',
  tgApiId: num(process.env.TG_API_ID, 0),
  tgApiHash: process.env.TG_API_HASH ?? '',
  twogisKey: process.env.TWOGIS_KEY ?? '',
  twogisQueries: (process.env.TWOGIS_QUERIES ?? 'Москва|кофейня;Москва|салон красоты')
    .split(';')
    .map((s) => s.split('|').map((x) => x.trim()))
    .filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][],
  devAuth: process.env.DEV_AUTH === '1' || !process.env.BOT_TOKEN,
  subscriptionDays: 30,
};

export type PlatformId = 'kwork' | 'flru' | 'freelanceru' | 'pchel' | 'telegram' | 'twogis';

export const PLATFORMS: Record<PlatformId, { name: string; site: string; linkable: boolean }> = {
  kwork: { name: 'Kwork', site: 'https://kwork.ru', linkable: true },
  flru: { name: 'FL.ru', site: 'https://www.fl.ru', linkable: true },
  freelanceru: { name: 'Freelance.ru', site: 'https://freelance.ru', linkable: true },
  pchel: { name: 'Pchel.net', site: 'https://pchel.net', linkable: true },
  telegram: { name: 'Telegram', site: 'https://t.me', linkable: true },
  twogis: { name: '2ГИС', site: 'https://2gis.ru', linkable: false },
};

/** Публичные TG-каналы с заказами на дизайн/сайты (проверены: есть веб-превью t.me/s/) */
export const DEFAULT_TG_CHANNELS = [
  'zakazy_design',
  'tildajobs',
  'tilda_zakazy',
  'webfrl',
  'designhunters',
  'designerjob',
  'design_freelance',
  'freelancetaverna',
  'designer_vakansii',
  'ux_jobs',
  'dsgn_job',
];

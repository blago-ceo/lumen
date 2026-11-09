import type { PlatformId } from './api';

export const PLATFORM_META: Record<PlatformId, { name: string; short: string; color: string; glyph: string }> = {
  kwork: { name: 'Kwork', short: 'Kwork', color: 'linear-gradient(135deg,#7cf29a,#2fd38a)', glyph: 'K' },
  flru: { name: 'FL.ru', short: 'FL', color: 'linear-gradient(135deg,#7ab8ff,#3d7bff)', glyph: 'FL' },
  freelanceru: { name: 'Freelance.ru', short: 'Freelance', color: 'linear-gradient(135deg,#d1a6ff,#8a5cff)', glyph: 'F' },
  pchel: { name: 'Pchel.net', short: 'Pchel', color: 'linear-gradient(135deg,#ffe07a,#ffb23d)', glyph: 'P' },
  telegram: { name: 'Telegram', short: 'Telegram', color: 'linear-gradient(135deg,#8be3ff,#2aabee)', glyph: '✈' },
  twogis: { name: '2ГИС', short: '2ГИС', color: 'linear-gradient(135deg,#c6f56a,#38c96b)', glyph: '2' },
};

const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
export function ago(ts: number) {
  const s = Math.round((ts - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 60) return 'только что';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export const clock = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Детерминированный градиент для аватара без фото */
export function avatarGradient(seed: number | string) {
  const s = String(seed);
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  const l = 55 + (h % 35);
  return `linear-gradient(135deg, hsl(0 0% ${l + 15}%), hsl(0 0% ${l - 20}%))`;
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

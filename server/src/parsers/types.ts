import type { PlatformId } from '../config.js';

export interface RawLead {
  extId: string;
  title: string;
  description: string;
  url: string;
  budgetText?: string | null;
  budgetValue?: number | null;
  author?: string | null;
  authorUrl?: string | null;
  contact?: string | null;
  category?: string | null;
  source?: string | null;
  publishedAt: number;
  /** лид из личного привязанного аккаунта — виден только владельцу */
  ownerId?: number | null;
  /** пропустить фильтр релевантности (напр. 2ГИС — там лид = компания без сайта) */
  forceRelevant?: boolean;
}

export interface Parser {
  id: PlatformId;
  /** интервал опроса */
  intervalMs: number;
  enabled(): boolean;
  fetch(): Promise<RawLead[]>;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function getText(url: string, init: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function parseBudget(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/\s|&nbsp;| /g, '').match(/(\d{3,9})/);
  return m ? Number(m[1]) : null;
}

export const clean = (s: string | null | undefined) =>
  (s ?? '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

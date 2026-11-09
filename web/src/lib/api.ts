import { tg } from './tg';

let token = '';
try {
  // localStorage, чтобы установленное приложение (PWA) не разлогинивало
  token = localStorage.getItem('lumen.token') ?? '';
} catch {
  /* приватный режим */
}

function saveToken(t: string) {
  token = t;
  try {
    if (t) localStorage.setItem('lumen.token', t);
    else localStorage.removeItem('lumen.token');
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Ошибка ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => req<T>('POST', p, b),
  patch: <T>(p: string, b: unknown) => req<T>('PATCH', p, b),
  del: <T>(p: string) => req<T>('DELETE', p),
  token: () => token,
  setToken: saveToken,
  logout: () => saveToken(''),
  /**
   * В Telegram — по initData. На сайте / в PWA — сохранённый токен,
   * иначе dev-вход (если сервер в DEV_AUTH), иначе 401 → экран входа через бота.
   */
  async login(): Promise<{ devMode: boolean }> {
    if (tg?.initData) {
      const r = await req<{ token: string; devMode: boolean }>('POST', '/api/auth', { initData: tg.initData });
      saveToken(r.token);
      return r;
    }
    if (token) {
      try {
        await req('GET', '/api/me');
        return { devMode: false };
      } catch {
        saveToken('');
      }
    }
    const r = await req<{ token: string; devMode: boolean }>('POST', '/api/auth', {});
    saveToken(r.token);
    return r;
  },
};

/* ───── типы ───── */
export interface User {
  id: number;
  nickname: string;
  name?: string;
  avatar?: string | null;
  ring: string;
  theme: string;
  banner: string;
  bio: string;
  statusEmoji: string;
  pro: boolean;
  admin: boolean;
  online: boolean;
  notify?: boolean;
  friendship?: 'friends' | 'outgoing' | 'incoming' | 'none';
  friends?: number;
  role?: string;
}

export type PlatformId = 'kwork' | 'flru' | 'freelanceru' | 'pchel' | 'telegram' | 'twogis';

export interface Lead {
  id: string;
  platform: PlatformId;
  title: string;
  description: string;
  budgetText: string | null;
  budgetValue: number | null;
  url: string;
  author: string | null;
  authorUrl: string | null;
  contact: string | null;
  category: string | null;
  source: string | null;
  score: number;
  isLanding: boolean;
  personal: boolean;
  publishedAt: number;
  saved: boolean;
  seen: boolean;
}

export interface Platform {
  id: PlatformId;
  name: string;
  site: string;
  linkable: boolean;
  enabled: boolean;
  lastOk: number | null;
  lastError: string | null;
  today: number;
}

export interface Message {
  id: number;
  conversationId: number;
  sender: User | null;
  text: string;
  kind: 'text' | 'lead' | 'system';
  payload: any;
  createdAt: number;
}

export interface Conversation {
  id: number;
  type: 'direct' | 'group' | 'support';
  title: string;
  emoji: string | null;
  ownerId: number | null;
  peer: User | null;
  members: User[];
  lastMessage: Message | null;
  unread: number;
  updatedAt: number;
}

export interface Billing {
  pro: boolean;
  expiresAt: number | null;
  priceRub: number;
  priceStars: number;
  canSimulate: boolean;
  botReady: boolean;
}

export interface LinkedAccount {
  id: number;
  platform: PlatformId;
  handle: string;
  profileUrl: string | null;
  status: string;
  meta: Record<string, any>;
  createdAt: number;
}

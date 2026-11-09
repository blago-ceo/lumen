/**
 * Агрегатор: личные Telegram-аккаунты пользователей (MTProto через GramJS).
 * - вход по номеру + код (+ облачный пароль 2FA)
 * - пользователь выбирает свои чаты/каналы → новые сообщения в них идут в его ленту
 * - ответ заказчику прямо из приложения от своего аккаунта
 */
import { Api, TelegramClient } from 'telegram';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import { StringSession } from 'telegram/sessions/index.js';
import { config } from '../config.js';
import { q, now } from '../db.js';
import { decrypt, encrypt } from './crypto.js';
import { ingest } from '../parsers/index.js';
import { postToLead } from '../parsers/telegram.js';

export const tgUserEnabled = () => !!(config.tgApiId && config.tgApiHash);

const newClient = (session = '') =>
  new TelegramClient(new StringSession(session), config.tgApiId, config.tgApiHash, {
    connectionRetries: 3,
    deviceModel: 'Lumen',
    appVersion: '1.0',
  });

/* ───────────── вход ───────────── */

interface Pending {
  client: TelegramClient;
  phone: string;
  phoneCodeHash: string;
  expires: number;
}
const pending = new Map<number, Pending>();
setInterval(() => {
  for (const [k, p] of pending)
    if (p.expires < Date.now()) {
      p.client.disconnect().catch(() => {});
      pending.delete(k);
    }
}, 60_000).unref();

export async function startLogin(userId: number, phone: string) {
  if (!tgUserEnabled()) throw new Error('TG_API_ID/TG_API_HASH не заданы на сервере');
  pending.get(userId)?.client.disconnect().catch(() => {});
  const client = newClient();
  await client.connect();
  const { phoneCodeHash } = await client.sendCode({ apiId: config.tgApiId, apiHash: config.tgApiHash }, phone);
  pending.set(userId, { client, phone, phoneCodeHash, expires: Date.now() + 5 * 60_000 });
  return { ok: true };
}

export async function confirmLogin(userId: number, code: string, password?: string) {
  const p = pending.get(userId);
  if (!p) throw new Error('Сессия входа истекла, запросите код ещё раз');
  try {
    await p.client.invoke(new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash, phoneCode: code }));
  } catch (e: any) {
    if (e?.errorMessage !== 'SESSION_PASSWORD_NEEDED') throw new Error(e?.errorMessage ?? 'Неверный код');
    if (!password) return { needPassword: true };
    await p.client.signInWithPassword(
      { apiId: config.tgApiId, apiHash: config.tgApiHash },
      {
        password: async () => password,
        onError: async (err) => {
          throw err;
        },
      },
    );
  }
  const me = (await p.client.getMe()) as Api.User;
  const session = (p.client.session as StringSession).save();
  const handle = me.username ? '@' + me.username : me.phone ? '+' + me.phone : String(me.id);
  q.run(
    `INSERT INTO linked_accounts (user_id, platform, handle, profile_url, session_enc, status, meta, created_at)
     VALUES (?, 'telegram', ?, ?, ?, 'active', ?, ?)
     ON CONFLICT(user_id, platform, handle) DO UPDATE SET session_enc = excluded.session_enc, status = 'active', meta = excluded.meta`,
    userId,
    handle,
    me.username ? `https://t.me/${me.username}` : null,
    encrypt(session),
    JSON.stringify({ tgId: String(me.id), name: [me.firstName, me.lastName].filter(Boolean).join(' ') }),
    now(),
  );
  pending.delete(userId);
  const acc = q.get<{ id: number }>("SELECT id FROM linked_accounts WHERE user_id = ? AND platform = 'telegram' AND handle = ?", userId, handle)!;
  live.set(acc.id, p.client);
  attachListener(acc.id, userId, p.client);
  return { ok: true, accountId: acc.id, handle };
}

/* ───────────── живые клиенты ───────────── */

const live = new Map<number, TelegramClient>();

async function clientFor(accountId: number) {
  let c = live.get(accountId);
  if (c?.connected) return c;
  const acc = q.get('SELECT * FROM linked_accounts WHERE id = ?', accountId);
  if (!acc?.session_enc) throw new Error('Аккаунт не найден');
  c = newClient(decrypt(acc.session_enc));
  await c.connect();
  live.set(accountId, c);
  return c;
}

function attachListener(accountId: number, userId: number, client: TelegramClient) {
  client.addEventHandler(async (ev: NewMessageEvent) => {
    const msg = ev.message;
    const chatId = msg.chatId?.toString();
    if (!chatId || !msg.message || msg.message.length < 30) return;
    const src = q.get(
      'SELECT title FROM tg_sources WHERE account_id = ? AND ref = ? AND enabled = 1',
      accountId,
      chatId,
    );
    if (!src) return;
    let authorName: string | null = null;
    let authorUrl: string | null = null;
    try {
      const sender = (await msg.getSender()) as Api.User | undefined;
      if (sender?.username) {
        authorName = '@' + sender.username;
        authorUrl = `https://t.me/${sender.username}`;
      }
    } catch {
      /* приватный отправитель */
    }
    const lead = postToLead(msg.message, {
      extId: `${chatId}_${msg.id}`,
      url: `https://t.me/c/${chatId.replace(/^-100/, '')}/${msg.id}`,
      author: authorName ?? src.title,
      authorUrl,
      category: 'Ваш Telegram',
      source: src.title,
      publishedAt: msg.date * 1000,
      ownerId: userId,
    });
    if (authorName && !lead.contact) lead.contact = authorName;
    ingest('telegram', [lead]);
  }, new NewMessage({}));
}

export async function bootLinkedAccounts() {
  if (!tgUserEnabled()) return;
  const accs = q.all("SELECT id, user_id FROM linked_accounts WHERE platform = 'telegram' AND status = 'active' AND session_enc IS NOT NULL");
  for (const a of accs) {
    try {
      const c = await clientFor(a.id);
      attachListener(a.id, a.user_id, c);
    } catch (e) {
      console.warn('[tg-user] не удалось поднять аккаунт', a.id, (e as Error).message);
      q.run("UPDATE linked_accounts SET status = 'error' WHERE id = ?", a.id);
    }
  }
  if (accs.length) console.log(`[tg-user] подключено аккаунтов: ${accs.length}`);
}

/** Чаты аккаунта, которые можно сделать источниками лидов */
export async function listDialogs(accountId: number) {
  const c = await clientFor(accountId);
  const dialogs = await c.getDialogs({ limit: 150 });
  const enabled = new Set(q.all<{ ref: string }>('SELECT ref FROM tg_sources WHERE account_id = ? AND enabled = 1', accountId).map((r) => r.ref));
  return dialogs
    .filter((d) => d.isGroup || d.isChannel)
    .map((d) => ({
      id: d.id!.toString(),
      title: d.title ?? d.name ?? 'Без названия',
      kind: d.isChannel && !d.isGroup ? 'channel' : 'group',
      enabled: enabled.has(d.id!.toString()),
    }));
}

export async function sendFromAccount(accountId: number, to: string, text: string) {
  const c = await clientFor(accountId);
  await c.sendMessage(to.replace(/^https?:\/\/t\.me\//, '').replace(/^@?/, '@'), { message: text });
}

export async function dropAccount(accountId: number) {
  const c = live.get(accountId);
  live.delete(accountId);
  if (c) {
    try {
      await c.invoke(new Api.auth.LogOut());
    } catch {
      /* already gone */
    }
    await c.disconnect().catch(() => {});
  }
}

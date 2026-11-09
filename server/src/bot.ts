import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import { q, now, type Row } from './db.js';
import { onNewLeads } from './parsers/index.js';
import { sendTo } from './realtime.js';
import { upsertUser } from './auth.js';
import { botInfo, confirmNonce } from './lib/webLogin.js';

export const bot = config.botToken ? new Bot(config.botToken) : null;

const PLATFORM_EMOJI: Record<string, string> = {
  kwork: '🟢',
  flru: '🔵',
  freelanceru: '🟣',
  pchel: '🐝',
  telegram: '✈️',
  twogis: '📍',
};

export async function createSubscriptionLink(userId: number): Promise<string> {
  if (!bot) throw new Error('BOT_TOKEN не задан');
  // Цифровые товары в Mini Apps оплачиваются только Telegram Stars (XTR).
  // subscription_period = 30 дней → Telegram сам продлевает подписку.
  return bot.api.createInvoiceLink(
    'Lumen Pro — доступ к парсеру',
    `Заказы на лендинги и веб-дизайн с 6 площадок в реальном времени. ${config.priceRub} ₽/мес`,
    `sub:${userId}:${now()}`,
    '',
    'XTR',
    [{ label: 'Подписка на 30 дней', amount: config.priceStars }],
    { subscription_period: 2592000 } as any,
  );
}

export function activateSubscription(userId: number, chargeId: string | null, amount: number, untilMs?: number) {
  const cur = q.get<{ expires_at: number }>('SELECT expires_at FROM subscriptions WHERE user_id = ?', userId);
  const base = Math.max(cur?.expires_at ?? 0, now());
  const expires = untilMs ?? base + config.subscriptionDays * 24 * 3600_000;
  q.run(
    `INSERT INTO subscriptions (user_id, expires_at, charge_id, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at, charge_id = excluded.charge_id, updated_at = excluded.updated_at`,
    userId,
    expires,
    chargeId,
    now(),
  );
  if (chargeId)
    q.run(
      'INSERT OR IGNORE INTO payments (user_id, charge_id, amount, currency, created_at) VALUES (?, ?, ?, ?, ?)',
      userId,
      chargeId,
      amount,
      'XTR',
      now(),
    );
  sendTo(userId, 'billing:updated', { pro: true, expiresAt: expires });
  return expires;
}

export async function startBot() {
  if (!bot) {
    console.log('[bot] BOT_TOKEN не задан — бот выключен (dev-режим)');
    return;
  }

  try {
    const me = await bot.api.getMe();
    botInfo.username = me.username;
    if (config.webappUrl.startsWith('https://')) {
      await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Lumen', web_app: { url: config.webappUrl } } });
    }
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть Lumen' },
      { command: 'paysupport', description: 'Вопросы по оплате' },
    ]);
  } catch (e) {
    console.warn('[bot] init:', (e as Error).message);
  }

  bot.command('start', async (ctx) => {
    if (ctx.from) upsertUser(ctx.from);
    // вход на сайте / в установленном приложении
    const payload = ctx.match;
    if (payload?.startsWith('login_') && ctx.from) {
      const ok = confirmNonce(payload.slice(6), ctx.from.id);
      await ctx.reply(ok ? '✓ Вход выполнен. Вернитесь в приложение Lumen — оно уже открывается.' : 'Ссылка входа устарела. Нажмите «Войти через Telegram» ещё раз.');
      return;
    }
    const kb = config.webappUrl ? new InlineKeyboard().webApp('✦ Открыть Lumen', config.webappUrl) : undefined;
    await ctx.reply(
      '<b>Lumen</b> — заказы на лендинги и веб-дизайн с Kwork, FL.ru, Freelance.ru, Pchel, Telegram и 2ГИС в одной ленте.\n\n' +
        `Подписка: <b>${config.priceRub} ₽/мес</b> (оплата Telegram Stars).`,
      { parse_mode: 'HTML', reply_markup: kb },
    );
  });

  bot.command('paysupport', (ctx) =>
    ctx.reply('По вопросам оплаты напишите в «Поддержку» внутри приложения — ответим в течение дня.'),
  );

  bot.on('pre_checkout_query', (ctx) => ctx.answerPreCheckoutQuery(true));

  bot.on('message:successful_payment', async (ctx) => {
    const p = ctx.message.successful_payment as any;
    const userId = ctx.from.id;
    upsertUser(ctx.from);
    const until = p.subscription_expiration_date ? p.subscription_expiration_date * 1000 : undefined;
    activateSubscription(userId, p.telegram_payment_charge_id, p.total_amount, until);
    await ctx.reply('✦ Подписка активна. Лента открыта — удачной охоты на клиентов!');
  });

  // Пуши о новых лендингах подписчикам (не чаще одного сообщения на пачку)
  onNewLeads(async (leads: Row[]) => {
    const landing = leads.filter((l) => l.is_landing && l.owner_id == null);
    if (!landing.length) return;
    const subs = q.all<{ id: number }>(
      'SELECT u.id FROM users u JOIN subscriptions s ON s.user_id = u.id WHERE u.notify = 1 AND s.expires_at > ?',
      now(),
    );
    const text =
      `✦ <b>Новые лендинги: ${landing.length}</b>\n\n` +
      landing
        .slice(0, 5)
        .map((l) => `${PLATFORM_EMOJI[l.platform] ?? '•'} <a href="${l.url}">${escape(l.title)}</a>${l.budget_text ? ` — ${escape(l.budget_text)}` : ''}`)
        .join('\n');
    const kb = config.webappUrl ? new InlineKeyboard().webApp('Открыть ленту', config.webappUrl) : undefined;
    for (const s of subs) {
      await bot.api
        .sendMessage(s.id, text, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } })
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 50)); // ~20 msg/s, в рамках лимитов
    }
  });

  bot.catch((e) => console.warn('[bot]', e.message));
  bot.start({ allowed_updates: ['message', 'pre_checkout_query'] }).catch((e) => console.error('[bot] start failed', e));
  console.log('[bot] запущен');
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

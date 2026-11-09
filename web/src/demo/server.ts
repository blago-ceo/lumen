/**
 * Демо-режим (сборка с VITE_DEMO=1, GitHub Pages): весь «бэкенд» живёт в браузере.
 * Те же URL и форматы ответов, что у настоящего сервера, — экраны не знают, что это демо.
 * Состояние в памяти: перезагрузка страницы = чистая демка.
 */
import rawLeads from './leads.json';

type Any = Record<string, any>;
type Emit = (type: string, data: unknown) => void;
let emit: Emit = () => {};
export function setDemoEmitter(fn: Emit) {
  emit = fn;
}

class DemoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fail = (status: number, msg: string): never => {
  throw new DemoError(status, msg);
};

const now = () => Date.now();
const MIN = 60_000;
const later = (ms: number, fn: () => void) => setTimeout(fn, ms);

/* ───── пользователи ───── */
const T0 = now();
const users = new Map<number, Any>();
function addUser(u: Any) {
  users.set(u.id, {
    name: u.nickname,
    avatar: null,
    ring: 'none',
    theme: 'violet',
    banner: 'nebula',
    bio: '',
    statusEmoji: '',
    customStatus: '',
    bannerUrl: null,
    bannerGrad: '',
    nickGrad: '',
    nickFont: 'manrope',
    presence: 'online',
    pro: false,
    admin: false,
    createdAt: T0 - 40 * 86400_000,
    ...u,
  });
}
addUser({
  id: 1, nickname: 'designer', name: 'Вы', ring: 'aurora', theme: 'violet', banner: 'prism',
  bio: 'Веб-дизайнер · лендинги под ключ · Figma → Tilda', statusEmoji: '✦', customStatus: 'Ищу заказы на лендинги',
  bannerGrad: '#7c3aed,#06b6d4', nickGrad: '#ffffff,#a78bfa', nickFont: 'unbounded', pro: true, admin: true,
  createdAt: T0 - 120 * 86400_000, aiPersona: 'Я веб-дизайнер, делаю лендинги под ключ: Figma → Tilda. Предложи созвон на 10 минут.',
});
addUser({ id: 101, nickname: 'kira_ui', name: 'Кира', ring: 'sunset', theme: 'rose', bio: 'UI/UX · лендинги для beauty', statusEmoji: '🌸', customStatus: 'в потоке, отвечаю вечером', bannerGrad: '#f43f5e,#f59e0b', nickGrad: '#fb7185,#fbbf24', nickFont: 'serif', pro: true });
addUser({ id: 102, nickname: 'max_tilda', name: 'Макс', ring: 'mint', theme: 'lime', bio: 'Tilda Expert · Zero Block', presence: 'idle', customStatus: 'обед 🍜', nickFont: 'mono', bannerGrad: '#22c55e,#14b8a6' });
addUser({ id: 103, nickname: 'nova_studio', name: 'Nova', ring: 'holo', theme: 'cyan', bio: 'Студия веб-дизайна · 4 человека · ищем подрядчиков', statusEmoji: '🚀', nickGrad: '#22d3ee,#818cf8,#e879f9', nickFont: 'unbounded', bannerGrad: '#0ea5e9,#6366f1,#d946ef', pro: true });
addUser({ id: 104, nickname: 'lena_motion', name: 'Лена', ring: 'ice', bio: 'Motion-дизайн, анимации для лендингов', presence: 'dnd', customStatus: 'дедлайн, не беспокоить', nickFont: 'script', nickGrad: '#c084fc,#f0abfc' });
addUser({ id: 105, nickname: 'artem_dev', name: 'Артём', ring: 'mono', bio: 'Фронтенд · React · верстаю ваши макеты', nickFont: 'pixel', presence: 'online' });
addUser({ id: 106, nickname: 'sasha_copy', name: 'Саша', bio: 'Копирайтер, тексты для лендингов', presence: 'offline' });
addUser({ id: 900, nickname: 'lumen_support', name: 'Поддержка', ring: 'holo', bio: 'Команда Lumen', statusEmoji: '🛟', admin: true });
const ME = 1;
const me = () => users.get(ME)!;

const friendships = new Map<string, 'accepted' | 'pending'>(); // `${from}:${to}`
const befriend = (a: number, b: number) => (friendships.set(`${a}:${b}`, 'accepted'), friendships.set(`${b}:${a}`, 'accepted'));
befriend(1, 101);
befriend(1, 103);
befriend(1, 105);
befriend(1, 104);
friendships.set('102:1', 'pending');

const publicUser = (u: Any): Any => {
  const { aiPersona, ...rest } = u;
  const presence = u.presence === 'invisible' ? 'offline' : u.presence;
  return { ...rest, presence, online: presence !== 'offline' };
};
const meDto = () => ({ ...publicUser(me()), presence: me().presence === 'invisible' ? 'offline' : me().presence, presencePref: me().presence, aiPersona: me().aiPersona ?? '', notify: true });

/* ───── заказы ───── */
interface LeadRow extends Any {
  id: string;
}
const leads: LeadRow[] = (rawLeads as Any[]).map((l, i): LeadRow => {
  const { ago, ...rest } = l;
  // реальные заказы из парсера, но «свежие»: раскидываем по последним ~2 суткам
  return { ...rest, id: l.id, publishedAt: T0 - (i * 26 + (i % 7) * 3 + 2) * MIN };
});
const leadState = new Map<string, { saved?: boolean; hidden?: boolean; seen?: boolean }>();
const responses = new Map<string, Any>(); // leadId → item
const leadDto = (l: LeadRow) => {
  const s = leadState.get(l.id) ?? {};
  return { ...l, personal: false, saved: !!s.saved, seen: !!s.seen, inResponses: responses.has(l.id) };
};

/* поток «новых» заказов: раз в ~40 секунд всплывает свежий из резерва */
const reserve = leads.splice(Math.max(0, leads.length - 12));
setInterval(() => {
  const l = reserve.shift();
  if (!l) return;
  l.publishedAt = now();
  leads.unshift(l);
  emit('leads:new', [leadDto(l)]);
}, 40_000);

/* ───── чаты ───── */
interface Conv extends Any {
  id: number;
  type: 'direct' | 'group' | 'support';
  members: { id: number; role?: string }[];
  lastRead: number;
}
const convs: Conv[] = [];
const messages: Any[] = [];
let msgSeq = 1;
let convSeq = 1;

function post(cid: number, senderId: number, text: string, kind = 'text', payload: unknown = null, at = now()) {
  const m = { id: msgSeq++, conversationId: cid, senderId, text, kind, payload, createdAt: at };
  messages.push(m);
  const c = convs.find((x) => x.id === cid);
  if (c) c.updatedAt = at;
  return m;
}
const msgDto = (m: Any) => ({ ...m, sender: users.has(m.senderId) ? publicUser(users.get(m.senderId)!) : null });
function convDto(c: Conv) {
  const members: Any[] = c.members.map((m) => ({ ...publicUser(users.get(m.id)!), role: m.role }));
  const list = messages.filter((m) => m.conversationId === c.id);
  const last = list[list.length - 1];
  const peer = c.type === 'direct' ? members.find((m) => m.id !== ME) ?? null : null;
  return {
    id: c.id,
    type: c.type,
    title: c.type === 'direct' ? peer?.nickname ?? 'Диалог' : c.type === 'support' ? 'Поддержка Lumen' : c.title,
    emoji: c.emoji ?? null,
    ownerId: c.ownerId ?? null,
    peer,
    members,
    lastMessage: last ? msgDto(last) : null,
    unread: list.filter((m) => m.id > c.lastRead && m.senderId !== ME).length,
    updatedAt: c.updatedAt,
  };
}
function newConv(c: Any & Pick<Conv, "type" | "members">) {
  const conv: Conv = { ...c, id: convSeq++, lastRead: 0, updatedAt: now() };
  convs.push(conv);
  return conv;
}
const memberOf = (cid: number) => {
  const c = convs.find((x) => x.id === cid && x.members.some((m) => m.id === ME));
  return c ?? fail(404, 'not_found');
};

// стартовые переписки
{
  const ago = (m: number) => T0 - m * MIN;
  const kira = newConv({ type: 'direct', members: [{ id: ME }, { id: 101 }] });
  post(kira.id, 101, 'Привет! Видела, ты тоже лендинги делаешь 👋', 'text', null, ago(180));
  post(kira.id, ME, 'Привет! Да, в основном Tilda и Figma', 'text', null, ago(176));
  post(kira.id, 101, 'Смотри какой заказ попался, мне не по профилю — может тебе зайдёт', 'text', null, ago(40));
  const l = leads.find((x) => x.isLanding) ?? leads[0];
  post(kira.id, 101, '', 'lead', (({ ...x }) => x)(l), ago(39));
  post(kira.id, 101, 'Бюджет норм, заказчик адекватный вроде', 'text', null, ago(38));
  kira.lastRead = msgSeq - 3;

  const team = newConv({ type: 'group', title: 'Лендинг-команда', emoji: '🚀', ownerId: ME, members: [{ id: ME, role: 'owner' }, { id: 101 }, { id: 103 }, { id: 105 }] });
  post(team.id, ME, 'designer создал(а) группу «Лендинг-команда»', 'system', null, ago(60 * 26));
  post(team.id, 103, 'Всем привет! Тут делим заказы: дизайн — Кира и designer, верстка — Артём', 'text', null, ago(60 * 25));
  post(team.id, 105, 'Ок, по фитнес-клубу макет когда будет?', 'text', null, ago(95));
  post(team.id, ME, 'Завтра к обеду скину первый экран', 'text', null, ago(90));
  post(team.id, 101, 'Я тогда иконки и иллюстрации возьму ✨', 'text', null, ago(22));
  team.lastRead = msgSeq - 2;

  const nova = newConv({ type: 'direct', members: [{ id: ME }, { id: 103 }] });
  post(nova.id, 103, 'Есть ещё один клиент на лендинг, интересно?', 'text', null, ago(60 * 5));
  post(nova.id, ME, 'Да, кидай детали', 'text', null, ago(60 * 5 - 3));
  nova.lastRead = msgSeq;

  const lena = newConv({ type: 'direct', members: [{ id: ME }, { id: 104 }] });
  post(lena.id, 104, 'Анимации для героя готовы, глянь в Figma 🎬', 'text', null, ago(60 * 30));
  lena.lastRead = msgSeq;
}

/* «живые» собеседники: печатают и отвечают */
const BOT_REPLIES: Record<number, string[]> = {
  101: ['Ага, поняла 🙌', 'Звучит круто! Скинь потом, что получилось', 'Я сейчас в Figma, через часик гляну', 'Давай созвонимся вечером?', 'Хаха, жиза 😅'],
  102: ['Ок 👍', 'На Tilda это делается за вечер', 'Zero Block решает'],
  103: ['Супер, тогда берём!', 'Клиент ждёт макет к пятнице', 'Скинул ТЗ в общий чат', 'Окей, обсудим на созвоне'],
  104: ['Сейчас на дедлайне, отвечу позже 🙏', 'Анимацию можно сделать на Lottie'],
  105: ['Сверстаю за 2 дня', 'Скинь макет в Figma, гляну', 'React или Tilda?', 'Принял 👌'],
  106: ['Тексты напишу к завтрашнему утру', 'Нужен тон: дружелюбный или деловой?'],
  900: ['Спасибо за обращение! Это демо-версия Lumen — тут всё работает на тестовых данных 🙂', 'Передали вопрос команде, ответим в течение дня'],
};
let replyIdx = 0;
function botReply(c: Conv, text: string) {
  const others = c.members.map((m) => m.id).filter((id) => id !== ME && users.get(id)?.presence !== 'offline');
  if (!others.length) return;
  const who = others[Math.floor(Math.random() * others.length)];
  const pool = BOT_REPLIES[who] ?? ['👍'];
  const answer = /\?$/.test(text.trim()) && who !== 900 ? ['Хороший вопрос 🤔 думаю да', 'Скорее да, чем нет', 'Давай уточню и отпишусь'][replyIdx % 3] : pool[replyIdx % pool.length];
  replyIdx++;
  later(700, () => emit('typing', { conversationId: c.id, userId: who }));
  later(2200, () => emit('typing', { conversationId: c.id, userId: who }));
  later(3200, () => emit('message:new', msgDto(post(c.id, who, answer))));
}

/* ───── аккаунты бирж ───── */
let accSeq = 1;
const accounts: Any[] = [
  { id: accSeq++, platform: 'kwork', handle: 'designer_pro', profileUrl: 'https://kwork.ru/user/designer_pro', status: 'active', meta: { verified: true, name: 'Kwork' }, createdAt: T0 - 20 * 86400_000 },
  { id: accSeq++, platform: 'flru', handle: 'designer', profileUrl: 'https://www.fl.ru/users/designer/', status: 'active', meta: { verified: true, name: 'FL.ru' }, createdAt: T0 - 18 * 86400_000 },
];
const PROFILE_URL: Record<string, (h: string) => string> = {
  kwork: (h) => `https://kwork.ru/user/${h}`,
  flru: (h) => `https://www.fl.ru/users/${h}/`,
  freelanceru: (h) => `https://freelance.ru/${h}`,
  pchel: (h) => `https://pchel.net/${h}/`,
};
const PLATFORMS: [string, string, string, boolean][] = [
  ['kwork', 'Kwork', 'https://kwork.ru', true],
  ['flru', 'FL.ru', 'https://www.fl.ru', true],
  ['freelanceru', 'Freelance.ru', 'https://freelance.ru', true],
  ['pchel', 'Pchel.net', 'https://pchel.net', true],
  ['telegram', 'Telegram', 'https://t.me', true],
  ['twogis', '2ГИС', 'https://2gis.ru', false],
];
const tgSources = [
  { ref: 'zakazy_design', enabled: true, builtIn: true },
  { ref: 'tildajobs', enabled: true, builtIn: true },
  { ref: 'freelancetaverna', enabled: true, builtIn: true },
  { ref: 'designer_jobs', enabled: true, builtIn: true },
];
const tgAccount = () => accounts.find((a) => a.platform === 'telegram');
let tgPending: string | null = null;
const dialogs = [
  { id: 'c1', title: 'Заказы на дизайн | Фриланс', kind: 'channel', enabled: true },
  { id: 'c2', title: 'Tilda Jobs', kind: 'channel', enabled: true },
  { id: 'c3', title: 'Дизайнеры СПб — чат', kind: 'group', enabled: false },
  { id: 'c4', title: 'Веб-студия: входящие', kind: 'group', enabled: false },
];

/* ───── отклики (ИИ) ───── */
const tgContact = (l: LeadRow) => (String(l.contact ?? '').match(/@[A-Za-z]\w{4,31}/) ?? [null])[0];
function itemDto(it: Any) {
  const l = leads.find((x) => x.id === it.leadId) ?? reserve.find((x) => x.id === it.leadId);
  return {
    leadId: it.leadId,
    status: it.status,
    text: it.text ?? null,
    channel: it.channel ?? null,
    error: null,
    to: l ? tgContact(l) : null,
    canAutoSend: !!(l && tgContact(l) && tgAccount()),
    lead: l ? leadDto(l) : null,
    updatedAt: it.updatedAt,
  };
}

/** «ИИ» демки: собирает отклик из заказа и инструкции исполнителя */
function writeReply(l: LeadRow, persona: string) {
  const p = persona.toLowerCase();
  const short = /коротк|2 предлож|на «ты»|на ты/.test(p);
  const ty = short || /на «ты»|на ты/.test(p);
  const what = l.isLanding ? 'лендинг' : l.isDev ? 'сайт' : 'дизайн';
  const topic = String(l.title).replace(/[«»"]/g, '').slice(0, 60).toLowerCase();
  const hi = ty ? 'Привет!' : ['Здравствуйте!', 'Добрый день!', 'Здравствуйте 👋'][l.id.length % 3];
  if (short) return `${hi} Сделаю ${what} — «${topic}». Покажу портфолио и первый экран за 2 дня, когда удобно обсудить?`;
  const who = /студент/.test(p)
    ? 'Я студент-дизайнер, беру первые заказы — поэтому делаю очень внимательно и по приятной цене, отвечаю быстро.'
    : /ии|нейросет|ai/.test(p)
      ? 'В работе использую ИИ, поэтому делаю быстрее и дешевле обычного — но каждую деталь проверяю руками.'
      : /опыт|5\+|лет/.test(p)
        ? 'Я веб-дизайнер с опытом 5+ лет, делаю лендинги под ключ: от структуры в Figma до сборки на Tilda.'
        : 'Я веб-дизайнер, делаю лендинги и сайты под ключ.';
  const budget = l.budgetText && !/обсужд|договор/i.test(l.budgetText) ? ` В бюджет ${l.budgetText} укладываюсь.` : '';
  const call = /созвон/.test(p) ? ' Предлагаю короткий созвон на 10 минут — сразу обсудим структуру.' : ' Подскажете сроки и есть ли референсы, которые нравятся?';
  return `${hi} Увидел${/студент/.test(p) ? '(а)' : ''} ваш заказ «${topic}». ${who}${budget} План такой: соберу структуру и смыслы, покажу первый экран, после согласования — остальной макет и сборка.${call}`;
}

let running = false;
function setItem(id: string, patch: Any) {
  const it = responses.get(id);
  if (!it) return;
  Object.assign(it, patch, { updatedAt: now() });
  emit('responses:update', itemDto(it));
}
async function runQueue() {
  running = true;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const queue = [...responses.values()].filter((x) => x.status === 'queued' || x.status === 'failed').slice(0, 20);
  for (let i = 0; i < queue.length; i += 3) {
    const batch = queue.slice(i, i + 3);
    batch.forEach((it) => setItem(it.leadId, { status: 'generating' }));
    await sleep(1400 + Math.random() * 900);
    for (const it of batch) {
      const l = leads.find((x) => x.id === it.leadId) ?? reserve.find((x) => x.id === it.leadId);
      if (!l) continue;
      setItem(it.leadId, { status: 'ready', text: writeReply(l, me().aiPersona ?? ''), channel: tgContact(l) && tgAccount() ? 'telegram' : 'manual' });
      await sleep(250);
    }
  }
  running = false;
  emit('responses:done', {});
}

/* ───── загрузка картинок: держим в памяти как blob-URL ───── */
function upload(body: unknown, field: 'avatar' | 'bannerUrl') {
  const file = body instanceof FormData ? (body.get('file') as File | null) : null;
  if (!file || !/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) fail(400, 'Нужна картинка или GIF');
  const url = URL.createObjectURL(file!);
  me()[field] = url;
  return { url, avatar: url };
}

/* ───── роутер ───── */
export async function demoRequest(method: string, fullPath: string, body: any): Promise<any> {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // как будто сеть
  try {
    return route(method, fullPath, body ?? {});
  } catch (e) {
    if (e instanceof DemoError) throw e;
    console.error('[demo]', method, fullPath, e);
    throw new DemoError(500, 'Ошибка демо');
  }
}
export { DemoError };

function route(method: string, fullPath: string, b: Any): any {
  const url = new URL(fullPath, 'https://demo.local');
  const path = url.pathname;
  const qs = Object.fromEntries(url.searchParams);
  const m = (re: RegExp) => re.exec(path);
  let r: RegExpExecArray | null;
  const M = method;

  /* вход */
  if (path === '/api/auth') return { token: 'demo', user: publicUser(me()), devMode: false };
  if (path === '/api/me' && M === 'GET') return { ...meDto(), options: {} };
  if (path === '/api/me' && M === 'PATCH') {
    const u = me();
    if (b.nickname !== undefined) {
      const nick = String(b.nickname).trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(nick)) fail(400, 'Ник: 3–20 символов, латиница, цифры, _');
      u.nickname = nick;
    }
    for (const k of ['statusEmoji', 'ring', 'theme', 'banner', 'bannerGrad', 'nickGrad', 'nickFont', 'presence', 'customStatus', 'bio', 'aiPersona'])
      if (b[k] !== undefined) u[k] = b[k];
    if (b.bannerUrl === null) u.bannerUrl = null;
    return meDto();
  }
  if (path === '/api/me/avatar') return upload(b, 'avatar');
  if (path === '/api/me/banner') return upload(b, 'bannerUrl');

  /* подписка */
  if (path === '/api/billing') return { pro: true, expiresAt: T0 + 27 * 86400_000, priceRub: 270, priceStars: 150, canSimulate: false, botReady: false };
  if (path.startsWith('/api/billing')) fail(400, 'В демо оплата отключена — Pro уже включён');

  /* люди */
  if (path === '/api/users/search') {
    const s = (qs.q ?? '').trim().replace(/^@/, '').toLowerCase();
    if (s.length < 2) return [];
    return [...users.values()].filter((u) => u.id !== ME && u.id !== 900 && (u.nickname.toLowerCase().startsWith(s) || String(u.name).toLowerCase().startsWith(s))).map(publicUser);
  }
  if ((r = m(/^\/api\/users\/(\d+)$/))) {
    const u = users.get(Number(r[1])) ?? fail(404, 'not_found');
    const fr = friendships.get(`${ME}:${u.id}`);
    const back = friendships.get(`${u.id}:${ME}`);
    const friendship = fr === 'accepted' ? 'friends' : fr ? 'outgoing' : back ? 'incoming' : 'none';
    const friends = [...friendships].filter(([k, v]) => k.startsWith(`${u.id}:`) && v === 'accepted').length + 3;
    return { ...publicUser(u), friendship, friends };
  }
  if (path === '/api/friends') {
    const list = (pred: (from: number, to: number, st: string) => boolean, pick: (from: number, to: number) => number) =>
      [...friendships].flatMap(([k, st]) => {
        const [from, to] = k.split(':').map(Number);
        return pred(from, to, st) ? [publicUser(users.get(pick(from, to))!)] : [];
      });
    return {
      friends: list((f, _t, st) => f === ME && st === 'accepted', (_f, t) => t),
      incoming: list((_f, t, st) => t === ME && st === 'pending', (f) => f),
      outgoing: list((f, _t, st) => f === ME && st === 'pending', (_f, t) => t),
    };
  }
  if ((r = m(/^\/api\/friends\/(\d+)$/))) {
    const fid = Number(r[1]);
    if (M === 'DELETE') {
      friendships.delete(`${ME}:${fid}`);
      friendships.delete(`${fid}:${ME}`);
      return { ok: true };
    }
    if (friendships.get(`${fid}:${ME}`) === 'pending') {
      befriend(ME, fid);
      return { status: 'friends' };
    }
    friendships.set(`${ME}:${fid}`, 'pending');
    // через пару секунд собеседник «принимает» заявку
    later(2500, () => {
      if (friendships.get(`${ME}:${fid}`) !== 'pending') return;
      befriend(ME, fid);
      emit('friends:updated', { from: publicUser(users.get(fid)!), accepted: true });
    });
    return { status: 'outgoing' };
  }

  /* площадки и лента */
  if (path === '/api/platforms')
    return PLATFORMS.map(([id, name, site, linkable], i) => ({
      id, name, site, linkable,
      enabled: id !== 'twogis',
      lastOk: id === 'twogis' ? null : now() - (i + 1) * 47_000,
      lastError: id === 'twogis' ? 'Нужен ключ API 2ГИС' : null,
      today: leads.filter((l) => l.platform === id && l.publishedAt > now() - 86400_000).length,
    }));
  if (path === '/api/leads/teaser') {
    const day = leads.filter((l) => l.publishedAt > now() - 86400_000);
    return { total: day.length, landing: day.filter((l) => l.isLanding).length, sample: leads.slice(0, 6).map((l) => ({ ...leadDto(l), description: l.description.slice(0, 90) })) };
  }
  if (path === '/api/leads') {
    let list = leads.filter((l) => !leadState.get(l.id)?.hidden);
    if (qs.platform) list = list.filter((l) => l.platform === qs.platform);
    if (qs.kind) {
      const kinds = qs.kind.split(',');
      list = list.filter((l) => (kinds.includes('landing') && l.isLanding) || (kinds.includes('design') && l.isDesign) || (kinds.includes('dev') && l.isDev));
    }
    if (qs.hasBudget === '1') list = list.filter((l) => l.budgetValue != null || (l.budgetText && l.budgetText !== 'Договорная'));
    if (qs.hasContact === '1') list = list.filter((l) => l.contact);
    if (qs.today === '1') list = list.filter((l) => l.publishedAt > now() - 86400_000);
    if (qs.saved === '1') list = list.filter((l) => leadState.get(l.id)?.saved);
    if (qs.mine === '1') list = [];
    if (qs.minBudget) list = list.filter((l) => (l.budgetValue ?? 0) >= Number(qs.minBudget));
    if (qs.q) {
      const s = qs.q.toLowerCase();
      list = list.filter((l) => l.title.toLowerCase().includes(s) || l.description.toLowerCase().includes(s));
    }
    if (qs.before) list = list.filter((l) => l.publishedAt < Number(qs.before));
    list.sort((a, c) => c.publishedAt - a.publishedAt);
    const page = list.slice(0, 30);
    return { items: page.map(leadDto), next: page.length === 30 ? page[29].publishedAt : null };
  }
  if ((r = m(/^\/api\/leads\/(.+)\/state$/))) {
    const id = decodeURIComponent(r[1]);
    const s = leadState.get(id) ?? {};
    for (const k of ['saved', 'hidden', 'seen'] as const) if (b[k] !== undefined) s[k] = !!b[k];
    leadState.set(id, s);
    return { ok: true };
  }

  /* отклики */
  if (path === '/api/responses' && M === 'GET')
    return {
      items: [...responses.values()].sort((a, c) => c.createdAt - a.createdAt).map(itemDto),
      persona: me().aiPersona ?? '',
      running,
      aiReady: true,
      telegramLinked: !!tgAccount(),
    };
  if (path === '/api/responses' && M === 'POST') {
    const id = String(b.leadId ?? '');
    if (!leads.some((l) => l.id === id)) fail(404, 'Заказ не найден');
    if (!responses.has(id)) responses.set(id, { leadId: id, status: 'queued', createdAt: now(), updatedAt: now() });
    return itemDto(responses.get(id)!);
  }
  if (path === '/api/responses' && M === 'DELETE') {
    for (const [k, v] of responses) if (v.status === 'sent') responses.delete(k);
    return { ok: true };
  }
  if (path === '/api/responses/run') {
    if (running) fail(409, 'Уже работаю над откликами');
    const n = [...responses.values()].filter((x) => x.status === 'queued' || x.status === 'failed').length;
    if (!n) fail(400, 'Корзина пуста — добавьте заказы из ленты');
    runQueue();
    return { started: Math.min(n, 20) };
  }
  if ((r = m(/^\/api\/responses\/(.+)\/send$/))) {
    const id = decodeURIComponent(r[1]);
    const it = responses.get(id);
    if (!it?.text) fail(400, 'Сначала сгенерируйте отклик');
    if (!tgAccount()) fail(400, 'Нужен привязанный Telegram — подключите его в «Хабе»');
    setItem(id, { status: 'sent', channel: 'telegram' });
    return { ok: true };
  }
  if ((r = m(/^\/api\/responses\/(.+)$/))) {
    const id = decodeURIComponent(r[1]);
    if (M === 'DELETE') {
      responses.delete(id);
      return { ok: true };
    }
    const patch: Any = {};
    if (b.text !== undefined) patch.text = String(b.text);
    if (b.status === 'sent') patch.status = 'sent';
    setItem(id, patch);
    return { ok: true };
  }

  /* аккаунты */
  if (path === '/api/accounts' && M === 'GET') return { items: accounts, telegramLogin: true };
  if (path === '/api/accounts' && M === 'POST') {
    const mk = PROFILE_URL[b.platform];
    if (!mk || !b.handle) fail(400, 'Неизвестная площадка');
    const h = String(b.handle).trim().replace(/^@/, '').replace(/.*\/(?:user|users)\//, '').replace(/\/+$/, '');
    if (!/^[\w.-]{2,40}$/.test(h)) fail(400, 'Некорректный логин');
    const name = PLATFORMS.find((p) => p[0] === b.platform)![1];
    const acc = { id: accSeq++, platform: b.platform, handle: h, profileUrl: mk(h), status: 'active', meta: { verified: true, name }, createdAt: now() };
    accounts.push(acc);
    return acc;
  }
  if (path === '/api/accounts/telegram/start') {
    const phone = String(b.phone ?? '').replace(/[^\d+]/g, '');
    if (phone.length < 10) fail(400, 'Введите номер в формате +7…');
    tgPending = phone;
    return { ok: true, sent: true };
  }
  if (path === '/api/accounts/telegram/confirm') {
    if (!tgPending) fail(400, 'Сначала введите номер');
    if (!/^\d{4,6}$/.test(String(b.code ?? '').trim())) fail(400, 'Код из 5 цифр — в демо подойдёт любой, например 12345');
    accounts.push({ id: accSeq++, platform: 'telegram', handle: '@designer', profileUrl: 'https://t.me/designer', status: 'active', meta: { verified: true, name: 'Telegram', phone: tgPending }, createdAt: now() });
    tgPending = null;
    return { handle: '@designer' };
  }
  if ((r = m(/^\/api\/accounts\/(\d+)\/dialogs$/))) return dialogs;
  if ((r = m(/^\/api\/accounts\/(\d+)\/sources$/))) {
    const d = dialogs.find((x) => x.id === String(b.ref));
    if (d) d.enabled = !!b.enabled;
    return { ok: true };
  }
  if ((r = m(/^\/api\/accounts\/(\d+)\/send$/))) {
    if (!String(b.text ?? '').trim()) fail(400, 'Пустое сообщение');
    return { ok: true };
  }
  if ((r = m(/^\/api\/accounts\/(\d+)$/)) && M === 'DELETE') {
    const i = accounts.findIndex((a) => a.id === Number(r![1]));
    if (i < 0) fail(404, 'not_found');
    accounts.splice(i, 1);
    return { ok: true };
  }
  if (path === '/api/sources/telegram' && M === 'GET') return tgSources;
  if (path === '/api/sources/telegram') {
    const ref = String(b.ref ?? '').trim().replace(/^https?:\/\/t\.me\/(s\/)?/, '').replace(/^@/, '');
    if (!/^[a-zA-Z][\w]{3,31}$/.test(ref)) fail(400, 'Нужен @username публичного канала');
    const ex = tgSources.find((s) => s.ref === ref);
    if (ex) ex.enabled = b.enabled !== false;
    else tgSources.push({ ref, enabled: b.enabled !== false, builtIn: false });
    return { ok: true };
  }

  /* чаты */
  const mine = () => convs.filter((c) => c.members.some((x) => x.id === ME));
  if (path === '/api/conversations' && M === 'GET') return mine().sort((a, c) => c.updatedAt - a.updatedAt).map(convDto);
  if (path === '/api/conversations/direct') {
    const peer = Number(b.userId);
    if (!users.has(peer) || peer === ME) fail(400, 'bad_user');
    const c = mine().find((x) => x.type === 'direct' && x.members.some((y) => y.id === peer)) ?? newConv({ type: 'direct', members: [{ id: ME }, { id: peer }] });
    return convDto(c);
  }
  if (path === '/api/conversations/group') {
    const name = String(b.title ?? '').trim().slice(0, 48);
    if (!name) fail(400, 'Назовите группу');
    const ids = [...new Set((b.memberIds ?? []).map(Number))].filter((id) => id !== ME && users.has(id as number)) as number[];
    const c = newConv({ type: 'group', title: name, emoji: b.emoji ?? '✦', ownerId: ME, members: [{ id: ME, role: 'owner' }, ...ids.map((id) => ({ id }))] });
    post(c.id, ME, `${me().nickname} создал(а) группу «${name}»`, 'system');
    c.lastRead = msgSeq;
    const first = ids[0];
    if (first) later(2500, () => emit('message:new', msgDto(post(c.id, first, 'О, привет всем! 👋'))));
    return convDto(c);
  }
  if (path === '/api/support') {
    let c = mine().find((x) => x.type === 'support');
    if (!c) {
      c = newConv({ type: 'support', title: 'Поддержка', emoji: '🛟', ownerId: ME, members: [{ id: ME, role: 'client' }, { id: 900, role: 'agent' }] });
      post(c.id, ME, 'Здравствуйте! Опишите вопрос — ответим в течение дня. Оплата, площадки, баги, идеи — всё сюда.', 'system');
      c.lastRead = msgSeq;
    }
    return convDto(c);
  }
  if ((r = m(/^\/api\/conversations\/(\d+)\/members\/me$/))) {
    const c = memberOf(Number(r[1]));
    post(c.id, ME, `${me().nickname} покинул(а) чат`, 'system');
    c.members = c.members.filter((x) => x.id !== ME);
    return { ok: true };
  }
  if ((r = m(/^\/api\/conversations\/(\d+)\/members\/(\d+)$/))) {
    const c = memberOf(Number(r[1]));
    if (c.ownerId !== ME) fail(403, 'Только создатель может исключать');
    const target = Number(r[2]);
    c.members = c.members.filter((x) => x.id !== target);
    post(c.id, ME, `${me().nickname} исключил(а) ${users.get(target)?.nickname}`, 'system');
    return convDto(c);
  }
  if ((r = m(/^\/api\/conversations\/(\d+)\/members$/))) {
    const c = memberOf(Number(r[1]));
    const ids = (b.userIds ?? []).map(Number).filter((id: number) => users.has(id) && !c.members.some((x) => x.id === id));
    c.members.push(...ids.map((id: number) => ({ id })));
    post(c.id, ME, `${me().nickname} добавил(а) участников: ${ids.length}`, 'system');
    return convDto(c);
  }
  if ((r = m(/^\/api\/conversations\/(\d+)\/messages$/))) {
    const c = memberOf(Number(r[1]));
    if (M === 'GET') return messages.filter((x) => x.conversationId === c.id).slice(-50).map(msgDto);
    const text = String(b.text ?? '').trim().slice(0, 4000);
    if (b.kind !== 'lead' && !text) fail(400, 'empty');
    const msg = msgDto(post(c.id, ME, text, b.kind === 'lead' ? 'lead' : 'text', b.kind === 'lead' ? b.payload : null));
    later(0, () => emit('message:new', msg));
    if (b.kind === 'lead') later(1500, () => {
      const other = c.members.find((x) => x.id !== ME && x.id !== 900);
      if (other) emit('message:new', msgDto(post(c.id, other.id, 'О, интересный заказ! Сейчас гляну 👀')));
    });
    else botReply(c, text);
    return msg;
  }
  if ((r = m(/^\/api\/conversations\/(\d+)\/read$/))) {
    const c = memberOf(Number(r[1]));
    c.lastRead = msgSeq;
    return { ok: true };
  }
  if ((r = m(/^\/api\/conversations\/(\d+)$/))) {
    const c = memberOf(Number(r[1]));
    if (M === 'PATCH') {
      const title = b.title !== undefined ? String(b.title).trim().slice(0, 48) : c.title;
      if (!title) fail(400, 'Название не может быть пустым');
      if (title !== c.title) post(c.id, ME, `${me().nickname} переименовал(а) группу в «${title}»`, 'system');
      c.title = title;
      if (b.emoji !== undefined) c.emoji = String(b.emoji);
      c.updatedAt = now();
    }
    return convDto(c);
  }

  if (path.startsWith('/api/auth/web')) fail(400, 'В демо вход не нужен');
  return fail(404, `Нет в демо: ${M} ${path}`);
}

/* ───── звонки: собеседник «берёт трубку» — второй RTCPeerConnection прямо в странице ───── */
function fakeStream(label: string) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 480 });
  const ctx = canvas.getContext('2d')!;
  const t0 = performance.now();
  const draw = () => {
    if (!canvas.isConnected && !(canvas as any).__alive) return;
    const t = (performance.now() - t0) / 1000;
    const g = ctx.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, `hsl(${(t * 20) % 360} 70% 22%)`);
    g.addColorStop(1, `hsl(${(t * 20 + 120) % 360} 70% 12%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);
    const r = 70 + Math.sin(t * 3) * 6;
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.arc(320, 220, r + 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.slice(0, 1).toUpperCase(), 320, 222);
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(label, 320, 340);
    requestAnimationFrame(draw);
  };
  (canvas as any).__alive = true;
  draw();
  const stream = canvas.captureStream(24);
  // тихая аудиодорожка, чтобы звонок был «настоящим»
  try {
    const ac = new AudioContext();
    const dst = ac.createMediaStreamDestination();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(dst);
    osc.start();
    dst.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  } catch {
    /* без звука */
  }
  const stop = () => ((canvas as any).__alive = false);
  stream.getTracks().forEach((tr) => tr.addEventListener('ended', stop));
  return { stream, stop };
}

/** Нет камеры/микрофона на компьютере преподавателя — подсовываем синтетическое видео */
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c?: MediaStreamConstraints) => {
    try {
      return await orig(c);
    } catch {
      const { stream } = fakeStream(me().nickname);
      if (!c?.video) stream.getVideoTracks().forEach((t) => stream.removeTrack(t));
      return stream;
    }
  };
}

const calls = new Map<string, { pc: RTCPeerConnection; stop: () => void; peerId: number; ready: Promise<void> }>();
const pendingCand = new Map<string, RTCIceCandidateInit[]>();
export function demoSendWs(msg: Any) {
  const c = convs.find((x) => x.id === msg.conversationId);
  if (msg.type === 'typing' || !c) return;
  const peer = c.members.find((m) => m.id !== ME);
  if (msg.type === 'call:invite') {
    const u = peer && users.get(peer.id);
    if (!u || u.presence === 'offline') return later(1200, () => emit('call:unavailable', { callId: msg.callId }));
    if (u.presence === 'dnd') return later(4000, () => emit('call:decline', { callId: msg.callId }));
    later(2600, () => emit('call:accept', { conversationId: c.id, callId: msg.callId }));
    return;
  }
  if (msg.type === 'call:signal') {
    const s = msg.signal ?? {};
    let call = calls.get(msg.callId);
    if (s.sdp?.type === 'offer') {
      const u = users.get(peer!.id)!;
      const pc = new RTCPeerConnection();
      const fake = fakeStream(u.nickname);
      fake.stream.getTracks().forEach((t) => pc.addTrack(t, fake.stream));
      pc.onicecandidate = (e) => e.candidate && emit('call:signal', { callId: msg.callId, signal: { candidate: e.candidate.toJSON() } });
      const ready = (async () => {
        await pc.setRemoteDescription(s.sdp);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        emit('call:signal', { callId: msg.callId, signal: { sdp: pc.localDescription } });
      })();
      call = { pc, stop: fake.stop, peerId: u.id, ready };
      calls.set(msg.callId, call);
    } else if (s.candidate) {
      const pending = pendingCand.get(msg.callId) ?? [];
      pending.push(s.candidate);
      pendingCand.set(msg.callId, pending);
    }
    if (call) {
      const cur = call;
      const list = pendingCand.get(msg.callId) ?? [];
      pendingCand.delete(msg.callId);
      cur.ready.then(() => list.forEach((cand) => cur.pc.addIceCandidate(cand).catch(() => {})));
    }
    return;
  }
  if (msg.type === 'call:end' || msg.type === 'call:decline') {
    const call = calls.get(msg.callId);
    call?.pc.close();
    call?.stop();
    calls.delete(msg.callId);
    pendingCand.delete(msg.callId);
  }
}

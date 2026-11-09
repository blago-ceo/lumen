/**
 * ИИ-отклики: короткое сообщение заказчику от лица исполнителя.
 * Claude через официальный SDK; без ключа — аккуратный шаблон, чтобы фича работала в dev.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Row } from '../db.js';

const MODEL = process.env.AI_MODEL || 'claude-opus-5-5';
export const aiReady = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `Ты пишешь отклик фрилансера на заказ. Пиши по-русски, от первого лица, как живой человек в мессенджере.
Требования:
- 2–4 коротких предложения, без воды, без канцелярита и без шаблонных фраз вроде «Здравствуйте, меня заинтересовал ваш проект».
- Покажи, что прочитал заказ: зацепись за 1–2 конкретные детали из него.
- Предложи понятный следующий шаг и закончи коротким вопросом заказчику.
- Не выдумывай кейсы, ссылки, цены и сроки — используй их только если они есть в инструкциях исполнителя.
- Без эмодзи, хэштегов и markdown.
Верни только текст сообщения.`;

export function templateReply(lead: Row, persona: string) {
  const who = persona.trim() ? '' : 'Я веб-дизайнер, делаю лендинги под ключ. ';
  const what = lead.is_landing ? 'лендинг' : lead.is_dev ? 'сайт' : 'дизайн';
  return `Привет! Увидел заказ «${String(lead.title).slice(0, 70)}». ${who}Могу сделать ${what}: сначала коротко соберу задачу и структуру, потом макет и сборку. Подскажете, к какому сроку нужно и есть ли референсы?`;
}

export async function writeReply(lead: Row, persona: string): Promise<string> {
  if (!aiReady()) return templateReply(lead, persona);

  const order = [
    `Площадка: ${lead.platform}`,
    `Заголовок: ${lead.title}`,
    lead.budget_text ? `Бюджет: ${lead.budget_text}` : '',
    `Описание:\n${String(lead.description).slice(0, 3000)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const content = `<заказ>\n${order}\n</заказ>\n\n<инструкции_исполнителя>\n${persona.trim() || 'Я веб-дизайнер, делаю лендинги под ключ.'}\n</инструкции_исполнителя>\n\nНапиши отклик на этот заказ.`;

  const res = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: 'low' },
    // при отказе классификатора API само переспросит подходящую модель
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  } as any);

  if ((res as any).stop_reason === 'refusal') return templateReply(lead, persona);
  const text = (res.content as any[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text || templateReply(lead, persona);
}

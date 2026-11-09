/**
 * «Отклики» (Pro): корзина заказов → одна большая кнопка → ИИ пишет каждому заказчику.
 * Инструкцию для ИИ человек пишет сам: «пиши, что я студент», «скажи, что работаю с ИИ» и т.п.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { listItem, spring } from '../components/ui';
import { api, type Lead } from '../lib/api';
import { on, useStore } from '../lib/store';
import { haptic, openLink } from '../lib/tg';
import { cx, plural } from '../lib/util';
import { PlatformTag } from './LeadCard';
import { Paywall } from './Paywall';

interface Item {
  leadId: string;
  status: 'queued' | 'generating' | 'ready' | 'sent' | 'failed';
  text: string | null;
  channel: 'telegram' | 'manual' | null;
  error: string | null;
  to: string | null;
  canAutoSend: boolean;
  lead: Lead | null;
}

const PRESETS = [
  ['Студент', 'Я студент-дизайнер, беру первые заказы, поэтому делаю качественно и недорого. Упомяни, что быстро отвечаю.'],
  ['Работаю с ИИ', 'Я дизайнер, который использует ИИ в работе — поэтому делаю быстрее и дешевле обычного, но всё проверяю руками.'],
  ['Опытный', 'Я веб-дизайнер с опытом 5+ лет, делаю лендинги под ключ: Figma → Tilda. Предложи созвон на 10 минут.'],
  ['Коротко', 'Пиши максимально коротко, 2 предложения, на «ты».'],
] as const;

const STATUS_LABEL: Record<Item['status'], string> = {
  queued: 'в очереди',
  generating: 'пишу…',
  ready: 'готов',
  sent: 'отправлен',
  failed: 'ошибка',
};

export function Responses() {
  const { billing, me } = useStore();
  return billing?.pro || me?.admin ? <ResponsesInner /> : <Paywall />;
}

function ResponsesInner() {
  const { me, setMe, toast } = useStore();
  const [items, setItems] = useState<Item[]>([]);
  const [persona, setPersona] = useState(me?.aiPersona ?? '');
  const [running, setRunning] = useState(false);
  const [meta, setMeta] = useState({ aiReady: false, telegramLinked: false });
  const [loaded, setLoaded] = useState(false);
  const saveT = useRef<number>(0);

  const load = (withPersona = false) =>
    api.get<{ items: Item[]; persona: string; running: boolean; aiReady: boolean; telegramLinked: boolean }>('/api/responses').then((r) => {
      setItems(r.items);
      if (withPersona) setPersona(r.persona);
      setRunning(r.running);
      setMeta({ aiReady: r.aiReady, telegramLinked: r.telegramLinked });
      setLoaded(true);
    });

  useEffect(() => {
    load(true);
    const off1 = on('responses:update', (it: Item) => setItems((s) => s.map((x) => (x.leadId === it.leadId ? it : x))));
    const off2 = on('responses:done', () => {
      setRunning(false);
      haptic.ok();
      load();
    });
    return () => {
      off1();
      off2();
    };
  }, []);

  const editPersona = (v: string) => {
    setPersona(v);
    clearTimeout(saveT.current);
    saveT.current = window.setTimeout(async () => {
      await api.patch('/api/me', { aiPersona: v });
      if (me) setMe({ ...me, aiPersona: v });
    }, 600);
  };

  const run = async () => {
    haptic.tap('heavy');
    try {
      // сначала сохраняем инструкцию, чтобы ИИ писал уже по свежей
      clearTimeout(saveT.current);
      await api.patch('/api/me', { aiPersona: persona });
      const r =await api.post<{ started: number }>('/api/responses/run');
      setRunning(true);
      toast(`Пишу ${r.started} ${plural(r.started, 'отклик', 'отклика', 'откликов')}`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const remove = async (id: string) => {
    setItems((s) => s.filter((x) => x.leadId !== id));
    await api.del(`/api/responses/${encodeURIComponent(id)}`);
  };

  const copyAndOpen = async (it: Item) => {
    if (it.text) await navigator.clipboard?.writeText(it.text).catch(() => {});
    toast('Текст скопирован — вставьте его в отклик', 'ok');
    if (it.lead) openLink(it.lead.url);
    await api.patch(`/api/responses/${encodeURIComponent(it.leadId)}`, { status: 'sent' });
  };

  const sendTg = async (it: Item) => {
    try {
      await api.post(`/api/responses/${encodeURIComponent(it.leadId)}/send`);
      haptic.ok();
      toast(`Отправлено ${it.to}`, 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const editText = (id: string, text: string) => {
    setItems((s) => s.map((x) => (x.leadId === id ? { ...x, text } : x)));
    api.patch(`/api/responses/${encodeURIComponent(id)}`, { text });
  };

  const clearSent = async () => {
    await api.del('/api/responses');
    setItems((s) => s.filter((x) => x.status !== 'sent'));
  };

  const pending = items.filter((x) => x.status === 'queued' || x.status === 'failed').length;
  const sent = items.filter((x) => x.status === 'sent').length;

  return (
    <div className="screen" style={{ paddingTop: 'calc(var(--safe-top) + 14px)' }}>
      <div className="content">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="h1">Отклики</h1>
            <div className="small muted" style={{ marginTop: 6 }}>
              ИИ пишет каждому заказчику из корзины
            </div>
          </div>
          <div className="spacer" />
          <span className="badge badge-accent">
            <Icon name="crown" size={12} stroke={2.2} /> PRO
          </span>
        </div>

        <div className="section-label">Кто вы для ИИ</div>
        <div className="glass" style={{ padding: 14, borderRadius: 22 }}>
          <textarea
            className="area"
            rows={3}
            value={persona}
            maxLength={1500}
            onChange={(e) => editPersona(e.target.value)}
            placeholder="Напишите как есть: «я студент, делаю первые лендинги», «скажи, что я работаю с ИИ», «предложи созвон», «на ты»…"
          />
          <div className="chips" style={{ marginTop: 10 }}>
            {PRESETS.map(([name, text]) => (
              <button key={name} className="chip" onClick={() => (haptic.select(), editPersona(persona.trim() ? `${persona.trim()}\n${text}` : text))}>
                <Icon name="wand" size={14} /> {name}
              </button>
            ))}
          </div>
          {!meta.aiReady && <div className="tiny faint" style={{ marginTop: 8 }}>ИИ-ключ не подключён на сервере — пока используется шаблон.</div>}
        </div>

        <div style={{ margin: '18px 0 6px' }}>
          <motion.button whileTap={{ scale: 0.97 }} transition={spring} className={cx('big-reply', running && 'busy')} disabled={running || !pending} onClick={run}>
            <span className="shine" />
            <motion.span animate={running ? { rotate: 360 } : { rotate: 0 }} transition={running ? { repeat: Infinity, duration: 1.2, ease: 'linear' } : {}} style={{ display: 'grid' }}>
              <Icon name={running ? 'refresh' : 'bolt'} size={24} stroke={2.2} color="#000" />
            </motion.span>
            {running ? 'Пишу отклики…' : pending ? `Откликнуться · ${pending}` : 'Откликнуться'}
          </motion.button>
          <div className="tiny muted" style={{ textAlign: 'center', marginTop: 8 }}>
            {meta.telegramLinked
              ? 'Заказчикам из Telegram отправлю сам, с паузами. На биржах — скопируйте текст и откройте заказ.'
              : 'Привяжите Telegram во вкладке «Аккаунты» — тогда TG-заказчикам отправлю сам.'}
          </div>
        </div>

        <div className="row section-label">
          <span>Корзина · {items.length}</span>
          <div className="spacer" />
          {sent > 0 && (
            <button className="tiny" style={{ fontWeight: 700 }} onClick={clearSent}>
              убрать отправленные
            </button>
          )}
        </div>

        {loaded && items.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass" style={{ padding: 22, borderRadius: 24, textAlign: 'center' }}>
            <Icon name="bolt" size={32} />
            <div className="h3" style={{ marginTop: 10 }}>Корзина пуста</div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              В ленте откройте заказ и нажмите «В отклики» — он появится здесь.
            </p>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {items.map((it, i) => (
            <motion.div key={it.leadId} layout variants={listItem} custom={i} initial="hidden" animate="show" exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }} className="glass" style={{ padding: 14, borderRadius: 22, marginBottom: 10 }}>
              <div className="row" style={{ gap: 8 }}>
                {it.lead && <PlatformTag lead={it.lead} />}
                <div className="spacer" />
                <span className={cx('resp-status', it.status)}>{STATUS_LABEL[it.status]}</span>
                <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => remove(it.leadId)} aria-label="Убрать">
                  <Icon name="close" size={16} />
                </button>
              </div>
              <div style={{ fontWeight: 700, marginTop: 8, lineHeight: 1.3 }}>{it.lead?.title ?? 'Заказ удалён'}</div>
              {it.lead?.budgetText && <div className="small" style={{ fontWeight: 800, marginTop: 4 }}>{it.lead.budgetText}</div>}

              {it.status === 'generating' && (
                <div className="resp-text">
                  <div className="skeleton" style={{ height: 12, borderRadius: 6, width: '90%' }} />
                  <div className="skeleton" style={{ height: 12, borderRadius: 6, width: '70%', marginTop: 8 }} />
                </div>
              )}
              {it.text && it.status !== 'generating' && (
                <textarea className="resp-text" rows={4} value={it.text} onChange={(e) => editText(it.leadId, e.target.value)} readOnly={it.status === 'sent'} />
              )}
              {it.error && <div className="tiny" style={{ color: 'var(--danger)', marginTop: 6 }}>{it.error}</div>}

              {it.status === 'ready' && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  {it.canAutoSend ? (
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => sendTg(it)}>
                      <Icon name="send" size={17} /> Отправить {it.to}
                    </button>
                  ) : (
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => copyAndOpen(it)}>
                      <Icon name="copy" size={17} /> Скопировать и открыть
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

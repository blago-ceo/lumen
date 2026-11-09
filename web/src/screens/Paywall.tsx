import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { listItem, softSpring } from '../components/ui';
import { api, type Lead } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic, openInvoice } from '../lib/tg';
import { PLATFORM_META, plural } from '../lib/util';
import { LeadCard } from './LeadCard';

const PERKS = [
  ['sparkle', 'Лендинги и веб-дизайн', 'Умный фильтр отсекает мусор, самопиар и «карточки WB»'],
  ['refresh', '6 площадок в реальном времени', 'Kwork, FL.ru, Freelance.ru, Pchel, Telegram, 2ГИС'],
  ['bell', 'Пуш в бота', 'Новый лендинг — уведомление за секунды, пока конкуренты спят'],
  ['link', 'Свои аккаунты', 'Подключите Telegram: заказы из ваших чатов + ответ в 1 тап'],
] as const;

export function Paywall() {
  const { billing, refreshBilling, toast } = useStore();
  const [teaser, setTeaser] = useState<{ total: number; landing: number; sample: Lead[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<typeof teaser>('/api/leads/teaser').then(setTeaser);
  }, []);

  const subscribe = async () => {
    haptic.tap('medium');
    setBusy(true);
    try {
      const { link } = await api.post<{ link: string }>('/api/billing/invoice');
      const status = await openInvoice(link);
      if (status === 'paid') {
        haptic.ok();
        toast('Подписка активна!', 'ok');
        setTimeout(refreshBilling, 800);
      }
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    await api.post('/api/billing/simulate');
    haptic.ok();
    toast('Dev: подписка активирована', 'ok');
    refreshBilling();
  };

  return (
    <div className="screen">
      <div className="content">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
          <div className="row small muted" style={{ gap: 8 }}>
            <span className="dot-live" /> Парсер работает прямо сейчас
          </div>
          <h1 className="h1" style={{ marginTop: 12, fontSize: 34 }}>
            Клиенты на лендинги —<br />
            <span className="gradient-text">сами в ленту</span>
          </h1>
        </motion.div>

        {teaser && (
          <motion.div className="row" style={{ gap: 10, marginTop: 20 }} initial="hidden" animate="show">
            {[
              [teaser.total, plural(teaser.total, 'заказ', 'заказа', 'заказов') + ' за сутки'],
              [teaser.landing, plural(teaser.landing, 'лендинг', 'лендинга', 'лендингов')],
            ].map(([n, label], i) => (
              <motion.div key={i} custom={i} variants={listItem} className="glass" style={{ flex: 1, padding: '14px 16px', borderRadius: 22 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 600 }} className="gradient-text">
                  <Counter to={Number(n)} />
                </div>
                <div className="small muted">{label}</div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* размытый предпросмотр ленты */}
        <div style={{ position: 'relative', marginTop: 16, height: 250, overflow: 'hidden', borderRadius: 26 }}>
          <div className="col" style={{ gap: 10, filter: 'blur(5px) saturate(1.1)', opacity: 0.75, pointerEvents: 'none' }}>
            {teaser?.sample.slice(0, 3).map((l) => <LeadCard key={l.id} lead={l} locked />)}
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 20%, var(--bg) 96%)' }} />
          <motion.div
            className="glass strong liquid"
            style={{ position: 'absolute', left: '50%', top: '42%', translateX: '-50%', padding: '10px 16px', borderRadius: 99, display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon name="sparkle" size={16} /> Откроется после подписки
          </motion.div>
        </div>

        <div className="col" style={{ gap: 8, marginTop: 6 }}>
          {PERKS.map(([icon, title, sub], i) => (
            <motion.div key={title} custom={i + 2} variants={listItem} initial="hidden" animate="show" className="row" style={{ gap: 14, padding: '10px 4px' }}>
              <div className="icon-btn" style={{ color: 'var(--accent)' }}>
                <Icon name={icon} size={20} />
              </div>
              <div>
                <div className="h3" style={{ fontSize: 15 }}>{title}</div>
                <div className="small muted">{sub}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="row" style={{ gap: 6, flexWrap: 'wrap', margin: '14px 0 4px' }}>
          {Object.values(PLATFORM_META).map((p) => (
            <span key={p.name} className="badge badge-soft" style={{ height: 26 }}>
              <span className="pf-glyph" style={{ width: 16, height: 16, borderRadius: 5, fontSize: 8.5, background: p.color }}>{p.glyph}</span>
              {p.name}
            </span>
          ))}
        </div>

        <motion.div className="glass strong" style={{ padding: 20, marginTop: 18, borderRadius: 30 }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...softSpring, delay: 0.3 }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em' }}>{billing?.priceRub ?? 270} ₽</div>
            <div className="muted" style={{ marginLeft: 6 }}>/ месяц</div>
            <div className="spacer" />
            <span className="badge badge-accent">Pro</span>
          </div>
          <div className="small muted" style={{ margin: '4px 0 16px' }}>Оплата Telegram Stars · ⭐ {billing?.priceStars ?? 180} · автопродление, отмена в любой момент</div>
          <button className="btn btn-primary btn-block" style={{ height: 54, fontSize: 16 }} disabled={busy || !billing?.botReady} onClick={subscribe}>
            {busy ? 'Открываем оплату…' : `Оформить за ⭐ ${billing?.priceStars ?? 180}`}
          </button>
          {!billing?.botReady && <p className="tiny faint" style={{ textAlign: 'center', margin: '10px 0 0' }}>Оплата заработает, когда на сервере будет задан BOT_TOKEN</p>}
          {billing?.canSimulate && (
            <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 10 }} onClick={simulate}>
              Dev: симулировать оплату
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Counter({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}

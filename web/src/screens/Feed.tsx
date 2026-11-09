import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { listItem, spring } from '../components/ui';
import { api, type Lead, type Platform, type PlatformId } from '../lib/api';
import { on, useStore } from '../lib/store';
import { haptic } from '../lib/tg';
import { PLATFORM_META, cx, plural } from '../lib/util';
import { LeadCard } from './LeadCard';
import { LeadSheet } from './LeadSheet';
import { Paywall } from './Paywall';

type Extra = 'landing' | 'design' | 'dev' | 'budget' | 'contact' | 'today' | 'mine' | 'b10' | 'b30';

export function Feed() {
  const { billing, me } = useStore();
  const unlocked = billing?.pro || me?.admin;
  return unlocked ? <FeedList /> : <Paywall />;
}

function FeedList() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platform, setPlatform] = useState<PlatformId | 'all'>('all');
  const [extras, setExtras] = useState<Set<Extra>>(new Set());
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Lead[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [incoming, setIncoming] = useState<Lead[]>([]);
  const [open, setOpen] = useState<Lead | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<Platform[]>('/api/platforms').then(setPlatforms);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const buildQuery = useCallback(
    (before?: number) => {
      const p = new URLSearchParams();
      if (platform !== 'all') p.set('platform', platform);
      const kinds = (['landing', 'design', 'dev'] as const).filter((k) => extras.has(k));
      if (kinds.length) p.set('kind', kinds.join(','));
      if (extras.has('budget')) p.set('hasBudget', '1');
      if (extras.has('contact')) p.set('hasContact', '1');
      if (extras.has('today')) p.set('today', '1');
      if (extras.has('mine')) p.set('mine', '1');
      if (extras.has('b30')) p.set('minBudget', '30000');
      else if (extras.has('b10')) p.set('minBudget', '10000');
      if (saved) p.set('saved', '1');
      if (debounced) p.set('q', debounced);
      if (before) p.set('before', String(before));
      return `/api/leads?${p}`;
    },
    [platform, extras, saved, debounced],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ items: Lead[]; next: number | null }>(buildQuery()).then((r) => {
      if (!alive) return;
      setItems(r.items);
      setNext(r.next);
      setLoading(false);
      setIncoming([]);
    });
    return () => {
      alive = false;
    };
  }, [buildQuery]);

  // бесконечная прокрутка
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !next) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const r = await api.get<{ items: Lead[]; next: number | null }>(buildQuery(next));
      setItems((s) => [...s, ...r.items.filter((x) => !s.some((y) => y.id === x.id))]);
      setNext(r.next);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [next, buildQuery]);

  // realtime: новые заказы копятся в плашке «N новых»
  useEffect(
    () =>
      on('leads:new', (leads: Lead[]) => {
        const kinds = (['landing', 'design', 'dev'] as const).filter((k) => extras.has(k));
        const fit = leads.filter(
          (l) =>
            (platform === 'all' || l.platform === platform) &&
            (!kinds.length || (kinds.includes('landing') && l.isLanding) || (kinds.includes('design') && l.isDesign) || (kinds.includes('dev') && l.isDev)) &&
            (!extras.has('contact') || !!l.contact) &&
            (!extras.has('budget') || !!l.budgetText),
        );
        if (fit.length) {
          haptic.tap('soft');
          setIncoming((s) => [...fit, ...s]);
        }
      }),
    [platform, extras],
  );

  const showIncoming = () => {
    haptic.tap('medium');
    setItems((s) => [...incoming.filter((x) => !s.some((y) => y.id === x.id)), ...s]);
    setIncoming([]);
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleExtra = (x: Extra) => {
    haptic.select();
    setExtras((s) => {
      const n = new Set(s);
      if (n.has(x)) n.delete(x);
      else {
        n.add(x);
        if (x === 'b10') n.delete('b30');
        if (x === 'b30') n.delete('b10');
      }
      return n;
    });
  };

  const patchLead = (id: string, patch: Partial<Lead>) => {
    setItems((s) => s.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setOpen((o) => (o?.id === id ? { ...o, ...patch } : o));
  };

  const openLead = (l: Lead) => {
    setOpen(l);
    if (!l.seen) {
      patchLead(l.id, { seen: true });
      api.post(`/api/leads/${encodeURIComponent(l.id)}/state`, { seen: true });
    }
  };

  const hideLead = (l: Lead) => {
    setItems((s) => s.filter((x) => x.id !== l.id));
    setOpen(null);
    api.post(`/api/leads/${encodeURIComponent(l.id)}/state`, { hidden: true });
  };

  const total = platforms.reduce((s, p) => s + p.today, 0);
  const live = platforms.filter((p) => p.enabled && !p.lastError).length;

  return (
    <div className="screen screen-feed" ref={scroller}>
      <div className="content">
        <header className="row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          <div>
            <h1 className="h1">
              <span className="gradient-text">Заказы</span>
            </h1>
            <div className="row small muted" style={{ gap: 8, marginTop: 8 }}>
              <span className="dot-live" />
              {live} из {platforms.length || 6} площадок · {total} {plural(total, 'новый', 'новых', 'новых')} за сутки
            </div>
          </div>
          <div className="spacer" />
          <motion.button whileTap={{ scale: 0.9 }} className={cx('icon-btn', saved && 'on')} onClick={() => (haptic.select(), setSaved(!saved))} aria-label="Сохранённые">
            <Icon name="bookmark" size={20} />
          </motion.button>
        </header>

        <label className="field glass thin" style={{ marginBottom: 12 }}>
          <Icon name="search" size={19} className="faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Лендинг, Tilda, Figma…" enterKeyHint="search" />
          {query && (
            <button onClick={() => setQuery('')} className="faint" aria-label="Очистить">
              <Icon name="close" size={18} />
            </button>
          )}
        </label>

        <div className="chips" style={{ isolation: 'isolate' }}>
          <PlatformChip active={platform === 'all'} onClick={() => setPlatform('all')} label="Все" />
          {platforms.map((p) => (
            <PlatformChip
              key={p.id}
              active={platform === p.id}
              onClick={() => setPlatform(p.id)}
              label={PLATFORM_META[p.id].short}
              glyph={p.id}
              count={p.today}
              dim={!p.enabled}
            />
          ))}
        </div>
        <div className="chips" style={{ isolation: 'isolate', marginTop: 2 }}>
          <ExtraChip on={extras.has('landing')} onClick={() => toggleExtra('landing')}>✦ Лендинги</ExtraChip>
          <ExtraChip on={extras.has('design')} onClick={() => toggleExtra('design')}>Дизайн</ExtraChip>
          <ExtraChip on={extras.has('dev')} onClick={() => toggleExtra('dev')}>Разработка</ExtraChip>
          <ExtraChip on={extras.has('today')} onClick={() => toggleExtra('today')}>За сутки</ExtraChip>
          <ExtraChip on={extras.has('budget')} onClick={() => toggleExtra('budget')}>С бюджетом</ExtraChip>
          <ExtraChip on={extras.has('contact')} onClick={() => toggleExtra('contact')}>С контактом</ExtraChip>
          <ExtraChip on={extras.has('b10')} onClick={() => toggleExtra('b10')}>от 10 000 ₽</ExtraChip>
          <ExtraChip on={extras.has('b30')} onClick={() => toggleExtra('b30')}>от 30 000 ₽</ExtraChip>
          <ExtraChip on={extras.has('mine')} onClick={() => toggleExtra('mine')}>Из моих чатов</ExtraChip>
          {extras.size > 0 && (
            <button className="chip" onClick={() => (haptic.select(), setExtras(new Set()))}>
              <Icon name="close" size={14} /> сбросить
            </button>
          )}
        </div>

        <AnimatePresence>
          {incoming.length > 0 && (
            <motion.div
              style={{ position: 'sticky', top: 4, zIndex: 5, display: 'flex', justifyContent: 'center', height: 0, overflow: 'visible' }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <motion.button className="btn btn-primary btn-sm" style={{ borderRadius: 99 }} onClick={showIncoming} layout transition={spring}>
                ↑ {incoming.length} {plural(incoming.length, 'новый заказ', 'новых заказа', 'новых заказов')}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="col lead-grid" style={{ gap: 12, marginTop: 14 }}>
          {loading ? (
            [0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 132, opacity: 1 - i * 0.2 }} />)
          ) : items.length === 0 ? (
            <div className="empty">
              <div className="big">{saved ? '🔖' : '🌙'}</div>
              <div className="h3">{saved ? 'Пока ничего не сохранено' : 'Тихо… пока'}</div>
              <p className="small">{saved ? 'Отмечайте интересные заказы закладкой' : 'Парсер проверяет площадки каждые несколько минут — новые заказы прилетят сюда сами.'}</p>
            </div>
          ) : (
            <AnimatePresence initial={true}>
              {items.map((l, i) => (
                <motion.div key={l.id} layout="position" custom={i} variants={listItem} initial="hidden" animate="show" exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}>
                  <LeadCard lead={l} onOpen={() => openLead(l)} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
          {next && !loading && <div className="skeleton" style={{ height: 100 }} />}
        </div>
      </div>

      <LeadSheet lead={open} onClose={() => setOpen(null)} onPatch={patchLead} onHide={hideLead} />
    </div>
  );
}

function PlatformChip({ active, onClick, label, glyph, count, dim }: { active: boolean; onClick: () => void; label: string; glyph?: PlatformId; count?: number; dim?: boolean }) {
  return (
    <button
      className={cx('chip', active && 'active')}
      style={{ opacity: dim ? 0.5 : 1 }}
      onClick={() => {
        haptic.select();
        onClick();
      }}
    >
      {active && <motion.div layoutId="pf-chip" className="chip-bg" transition={spring} />}
      {glyph && <span className="pf-glyph" style={{ width: 18, height: 18, borderRadius: 6, fontSize: 9.5, background: PLATFORM_META[glyph].color }}>{PLATFORM_META[glyph].glyph}</span>}
      {label}
      {!!count && <span className="count">{count}</span>}
    </button>
  );
}

function ExtraChip({ on: active, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button className={cx('chip', active && 'active')} onClick={onClick} whileTap={{ scale: 0.95 }}>
      <AnimatePresence>
        {active && <motion.div className="chip-bg" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={spring} />}
      </AnimatePresence>
      {children}
    </motion.button>
  );
}

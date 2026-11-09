import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Background } from './components/Background';
import { CursorGlow } from './components/CursorGlow';
import { CallProvider } from './lib/calls';
import { Icon } from './components/Icon';
import { Toasts, spring } from './components/ui';
import { api, type Conversation } from './lib/api';
import { on, useStore } from './lib/store';
import { haptic } from './lib/tg';
import { cx } from './lib/util';
import { Feed } from './screens/Feed';
import { Chats } from './screens/Chats';
import { Hub } from './screens/Hub';
import { Profile } from './screens/Profile';
import { Responses } from './screens/Responses';

type Tab = 'feed' | 'responses' | 'chats' | 'hub' | 'profile';
const TABS: [Tab, string, string][] = [
  ['feed', 'feed', 'Лента'],
  ['responses', 'bolt', 'Отклики'],
  ['chats', 'chat', 'Чаты'],
  ['hub', 'hub', 'Аккаунты'],
  ['profile', 'user', 'Профиль'],
];
const ORDER: Tab[] = TABS.map((t) => t[0]);

export default function App() {
  const { me, unread, setUnread } = useStore();
  const [tab, setTab] = useState<Tab>('feed');
  const [dir, setDir] = useState(1);
  const desktop = useDesktop();

  // на ПК чаты всегда справа — отдельная вкладка не нужна
  useEffect(() => {
    if (desktop && tab === 'chats') setTab('feed');
  }, [desktop, tab]);

  // счётчик непрочитанных для бейджа на табе
  useEffect(() => {
    if (!me) return;
    const sync = () =>
      api.get<Conversation[]>('/api/conversations').then((c) => setUnread(c.reduce((s, x) => s + x.unread, 0))).catch(() => {});
    sync();
    const off1 = on('message:new', sync);
    const off2 = on('conversations:changed', sync);
    return () => {
      off1();
      off2();
    };
  }, [me, setUnread]);

  const go = (t: Tab) => {
    if (t === tab) return;
    haptic.select();
    setDir(ORDER.indexOf(t) > ORDER.indexOf(tab) ? 1 : -1);
    setTab(t);
  };

  const screens = (
    <AnimatePresence initial={false} custom={dir} mode="popLayout">
      <motion.div
        key={tab}
        custom={dir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * 40, filter: 'blur(8px)' }),
          center: { opacity: 1, x: 0, filter: 'blur(0px)' },
          exit: (d: number) => ({ opacity: 0, x: d * -40, filter: 'blur(8px)' }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        {tab === 'feed' && <Feed />}
        {tab === 'responses' && <Responses />}
        {tab === 'chats' && <Chats />}
        {tab === 'hub' && <Hub />}
        {tab === 'profile' && <Profile />}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <CallProvider>
      <Background />
      <CursorGlow />
      <div className={cx('app', desktop && 'app-desk')}>
        {!me ? (
          <Splash />
        ) : desktop ? (
          <>
            {/* ПК: слева во весь экран — текущий раздел, справа — навигация и чаты, как в Discord */}
            <main className="desk-main">{screens}</main>
            <motion.aside className="desk-side glass" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ ...spring, delay: 0.1 }}>
              <div className="side-brand">
                <Icon name="sparkle" size={20} />
                <span>Lumen</span>
              </div>
              <nav className="side-nav">
                {TABS.filter(([id]) => id !== 'chats').map(([id, icon, label]) => (
                  <button key={id} className={cx('side-tab', tab === id && 'active')} onClick={() => go(id)}>
                    {tab === id && <motion.div layoutId="side-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                    <Icon name={icon} size={20} stroke={tab === id ? 2.1 : 1.8} />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
              <div className="side-chats">
                <Chats />
              </div>
            </motion.aside>
          </>
        ) : (
          screens
        )}
      </div>

      {me && !desktop && (
        <div className="tabbar-wrap">
          <motion.nav
            className="tabbar glass strong liquid"
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ ...spring, delay: 0.15 }}
          >
            {TABS.map(([id, icon, label]) => (
              <button key={id} className={cx('tab', tab === id && 'active')} onClick={() => go(id)}>
                {tab === id && <motion.div layoutId="tab-pill" className="tab-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                <motion.div animate={{ y: tab === id ? -1 : 0, scale: tab === id ? 1.06 : 1 }} transition={spring}>
                  <Icon name={icon} size={22} stroke={tab === id ? 2.1 : 1.8} />
                </motion.div>
                <span>{label}</span>
                {id === 'chats' && unread > 0 && <span className="unread">{unread > 99 ? '99+' : unread}</span>}
              </button>
            ))}
          </motion.nav>
        </div>
      )}
      <Toasts />
    </CallProvider>
  );
}

/** ПК-раскладка от 1100px: экран шире планшета и есть мышь */
function useDesktop() {
  const q = '(min-width: 1100px) and (hover: hover)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

function Splash() {
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -40 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        style={{ textAlign: 'center' }}
      >
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block' }}>
          <Icon name="sparkle" size={54} stroke={1.4} />
        </motion.div>
        <div className="h1 gradient-text" style={{ marginTop: 12 }}>
          Lumen
        </div>
      </motion.div>
    </div>
  );
}

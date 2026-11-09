import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, demoServer, type Billing, type User } from './api';

type Handler = (data: any) => void;

/* ───── realtime-шина поверх WebSocket ───── */
const handlers = new Map<string, Set<Handler>>();
export function on(type: string, fn: Handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(fn);
  return () => void handlers.get(type)!.delete(fn);
}
let socket: WebSocket | null = null;
const dispatch = (type: string, data: unknown) => handlers.get(type)?.forEach((h) => h(data));
export function sendWs(msg: object) {
  if (demoServer) {
    demoServer.then((d) => d.demoSendWs(msg as any));
    return;
  }
  if (socket?.readyState === 1) socket.send(JSON.stringify(msg));
}
function connectWs() {
  if (demoServer) {
    demoServer.then((d) => d.setDemoEmitter(dispatch));
    return;
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(api.token())}`);
  socket = ws;
  let ping: number;
  ws.onopen = () => (ping = window.setInterval(() => sendWs({ type: 'ping' }), 25_000));
  ws.onmessage = (e) => {
    try {
      const { type, data } = JSON.parse(e.data);
      handlers.get(type)?.forEach((h) => h(data));
    } catch {
      /* ignore */
    }
  };
  ws.onclose = (e) => {
    clearInterval(ping);
    if (e.code !== 4401) setTimeout(connectWs, 2500);
  };
}

/* ───── глобальное состояние ───── */
interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'err';
}
interface Ctx {
  me: User | null;
  setMe: (u: User) => void;
  billing: Billing | null;
  refreshBilling: () => Promise<void>;
  devMode: boolean;
  toast: (text: string, tone?: 'ok' | 'err') => void;
  toasts: Toast[];
  unread: number;
  setUnread: (n: number) => void;
}

const StoreCtx = createContext<Ctx>(null!);
export const useStore = () => useContext(StoreCtx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<User | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tid = useRef(0);

  const toast = useCallback((text: string, tone?: 'ok' | 'err') => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const refreshBilling = useCallback(async () => setBilling(await api.get<Billing>('/api/billing')), []);

  const [needLogin, setNeedLogin] = useState(false);
  const boot = useCallback(async () => {
    setMe(await api.get<User>('/api/me'));
    await refreshBilling();
    connectWs();
  }, [refreshBilling]);

  useEffect(() => {
    api
      .login()
      .then(async (r) => {
        setDevMode(r.devMode);
        await boot();
      })
      .catch((e) => (e?.status === 401 ? setNeedLogin(true) : setError(e.message)));
    return on('billing:updated', () => {
      refreshBilling();
      api.get<User>('/api/me').then(setMe);
    });
  }, [refreshBilling]);

  useEffect(() => {
    document.documentElement.dataset.theme = me?.theme ?? 'violet';
  }, [me?.theme]);

  if (needLogin) return <WebLogin onDone={() => (setNeedLogin(false), boot())} />;

  if (error)
    return (
      <div className="empty" style={{ position: 'relative', zIndex: 3, paddingTop: '30vh' }}>
        <div className="big">✦</div>
        <div className="h3">Не удалось войти</div>
        <p className="small">Откройте приложение из Telegram-бота. ({error})</p>
      </div>
    );

  return (
    <StoreCtx.Provider value={{ me, setMe, billing, refreshBilling, devMode, toast, toasts, unread, setUnread }}>
      {children}
    </StoreCtx.Provider>
  );
}

/** Вход вне Telegram (сайт / установленное приложение): через бота */
function WebLogin({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      const { nonce, link } = await api.post<{ nonce: string; link: string }>('/api/auth/web/start');
      window.open(link, '_blank');
      const until = Date.now() + 5 * 60_000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 2000));
        const r = await api.get<{ status: string; token?: string }>(`/api/auth/web/poll?nonce=${nonce}`);
        if (r.status === 'ok' && r.token) {
          api.setToken(r.token);
          return onDone();
        }
        if (r.status === 'expired') break;
      }
      setErr('Время входа истекло, попробуйте ещё раз');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 3, minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 360 }}>
        <img src="/icons/icon-192.png" width={84} height={84} alt="" style={{ borderRadius: 22 }} />
        <h1 className="h1" style={{ marginTop: 18 }}>Lumen</h1>
        <p className="muted">Заказы на лендинги и веб-дизайн с 6 площадок в одной ленте</p>
        <button className="btn btn-primary btn-block" style={{ marginTop: 22, height: 54 }} disabled={busy} onClick={start}>
          {busy ? 'Ждём подтверждения в боте…' : 'Войти через Telegram'}
        </button>
        {err && <p className="small" style={{ color: 'var(--danger)' }}>{err}</p>}
        <p className="tiny faint" style={{ marginTop: 18, lineHeight: 1.6 }}>
          {isIos ? 'Чтобы добавить на экран: Safari → «Поделиться» → «На экран «Домой»».' : 'Чтобы установить: меню браузера → «Установить приложение».'}
        </p>
      </div>
    </div>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet, Toggle, listItem, spring } from '../components/ui';
import { api, type LinkedAccount, type Platform, type PlatformId } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic, openLink } from '../lib/tg';
import { PLATFORM_META, ago } from '../lib/util';

export function Hub() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [tgLogin, setTgLogin] = useState(false);
  const [open, setOpen] = useState<PlatformId | null>(null);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([api.get<Platform[]>('/api/platforms'), api.get<{ items: LinkedAccount[]; telegramLogin: boolean }>('/api/accounts')]);
    setPlatforms(p);
    setAccounts(a.items);
    setTgLogin(a.telegramLogin);
  }, []);
  useEffect(() => void load(), [load]);

  const connected = accounts.length;

  return (
    <div className="screen">
      <div className="content">
        <h1 className="h1">Аккаунты</h1>
        <p className="muted" style={{ margin: '8px 0 18px' }}>
          Парсер + агрегатор: подключите свои аккаунты — заказы из ваших чатов попадут в общую ленту.
        </p>

        <div className="glass" style={{ padding: 16, borderRadius: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 30 }} className="gradient-text">
            {connected}/6
          </div>
          <div className="small muted" style={{ flex: 1 }}>
            {connected ? 'аккаунтов подключено. Telegram даёт больше всего: читает ваши чаты и отвечает заказчикам.' : 'Начните с Telegram — это самый богатый источник заказов.'}
          </div>
        </div>

        <div className="section-label">Площадки</div>
        <div className="pgrid">
          {platforms.map((p, i) => {
            const acc = accounts.filter((a) => a.platform === p.id);
            const m = PLATFORM_META[p.id];
            return (
              <motion.button
                key={p.id}
                custom={i}
                variants={listItem}
                initial="hidden"
                animate="show"
                whileTap={{ scale: 0.96 }}
                className="ptile glass"
                onClick={() => (haptic.tap(), setOpen(p.id))}
              >
                <div className="row" style={{ width: '100%' }}>
                  <span className="pf-glyph" style={{ width: 34, height: 34, borderRadius: 11, fontSize: 14, background: m.color }}>{m.glyph}</span>
                  <div className="spacer" />
                  {acc.length ? <span className="badge badge-ok">✓ {acc.length}</span> : <Icon name="plus" size={18} className="faint" />}
                </div>
                <div className="h3" style={{ marginTop: 4 }}>{m.name}</div>
                <div className="tiny muted" style={{ marginTop: 'auto' }}>
                  {!p.enabled ? (
                    <span style={{ color: 'var(--warn)' }}>парсер выключен</span>
                  ) : p.lastError ? (
                    <span style={{ color: 'var(--danger)' }}>ошибка парсинга</span>
                  ) : (
                    <>
                      <span style={{ color: 'var(--ok)' }}>●</span> {p.today} за сутки{p.lastOk ? ` · ${ago(p.lastOk)}` : ''}
                    </>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        <ChannelList />
      </div>

      <PlatformSheet
        platform={platforms.find((p) => p.id === open) ?? null}
        accounts={accounts.filter((a) => a.platform === open)}
        tgLogin={tgLogin}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </div>
  );
}

/* ───── шторка площадки ───── */
function PlatformSheet({ platform, accounts, tgLogin, onClose, onChanged }: { platform: Platform | null; accounts: LinkedAccount[]; tgLogin: boolean; onClose: () => void; onChanged: () => void }) {
  const { toast } = useStore();
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setHandle(''), [platform?.id]);

  if (!platform) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const m = PLATFORM_META[platform.id];

  const link = async () => {
    setBusy(true);
    try {
      await api.post('/api/accounts', { platform: platform.id, handle });
      haptic.ok();
      toast(`${m.name} подключён`, 'ok');
      setHandle('');
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (a: LinkedAccount) => {
    await api.del(`/api/accounts/${a.id}`);
    haptic.tap('medium');
    onChanged();
  };

  return (
    <Sheet open onClose={onClose}>
      <div className="row" style={{ gap: 12, marginBottom: 14 }}>
        <span className="pf-glyph" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 17, background: m.color }}>{m.glyph}</span>
        <div>
          <div className="h2">{m.name}</div>
          <button className="small muted" onClick={() => openLink(platform.site)}>{platform.site.replace('https://', '')} ↗</button>
        </div>
      </div>

      {platform.lastError && (
        <div className="glass thin small" style={{ padding: 12, borderRadius: 16, color: 'var(--danger)', marginBottom: 12 }}>
          Последняя ошибка парсера: {platform.lastError}
        </div>
      )}

      {accounts.map((a) => (
        <div key={a.id} className="glass thin" style={{ padding: 14, borderRadius: 20, marginBottom: 10 }}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h3">{a.handle}</div>
              <div className="tiny muted">
                {a.status === 'error' ? 'сессия слетела — подключите заново' : a.meta?.name ?? (a.meta?.verified ? 'профиль найден' : 'профиль не проверен')}
              </div>
            </div>
            {a.profileUrl && (
              <button className="icon-btn" onClick={() => openLink(a.profileUrl!)}>
                <Icon name="external" size={18} />
              </button>
            )}
            <button className="icon-btn" style={{ marginLeft: 8, color: 'var(--danger)' }} onClick={() => unlink(a)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
          {a.platform === 'telegram' && a.status === 'active' && <TgSources account={a} />}
        </div>
      ))}

      {platform.id === 'telegram' ? (
        tgLogin ? (
          <TgLogin onDone={onChanged} />
        ) : (
          <p className="small muted">Вход в Telegram-аккаунт включается, когда на сервере заданы TG_API_ID и TG_API_HASH (my.telegram.org). Публичные каналы с заказами парсятся и без этого — список ниже на экране.</p>
        )
      ) : platform.id === 'twogis' ? (
        <p className="small muted" style={{ lineHeight: 1.55 }}>
          2ГИС — не биржа, а каталог компаний. Парсер ищет бизнесы в нужных нишах <b>без сайта</b> и кладёт их в ленту как холодных клиентов на лендинг: название, адрес, рейтинг, телефон и соцсети. {platform.enabled ? '' : 'Сейчас выключено: нужен TWOGIS_KEY на сервере.'}
        </p>
      ) : (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            У {m.name} нет открытого API, поэтому аккаунт подключается по публичному профилю: он появится в хабе, а заказы площадки уже идут в ленту через парсер.
          </p>
          <label className="field" style={{ marginBottom: 10 }}>
            <Icon name="link" size={18} className="faint" />
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Логин или ссылка на профиль" autoCapitalize="off" />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || handle.trim().length < 2} onClick={link}>
            {busy ? 'Проверяем профиль…' : 'Подключить'}
          </button>
        </>
      )}
    </Sheet>
  );
}

/* ───── вход в Telegram: телефон → код → 2FA ───── */
function TgLogin({ onDone }: { onDone: () => void }) {
  const { toast } = useStore();
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [phone, setPhone] = useState('+7');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      haptic.err();
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    await api.post('/api/accounts/telegram/start', { phone });
    setStep('code');
  });
  const confirm = () => run(async () => {
    const r = await api.post<{ needPassword?: boolean; handle?: string }>('/api/accounts/telegram/confirm', { code, password: password || undefined });
    if (r.needPassword) return setStep('password');
    haptic.ok();
    toast(`Подключён ${r.handle}`, 'ok');
    setStep('phone');
    setCode('');
    setPassword('');
    onDone();
  });

  return (
    <div style={{ marginTop: 6 }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring} className="col">
          {step === 'phone' && (
            <>
              <div className="small muted">Войдите своим аккаунтом — выберите чаты с заказами, и новые сообщения из них станут лидами. Сессия хранится зашифрованной.</div>
              <label className="field">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+7 900 000-00-00" />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy} onClick={start}>{busy ? 'Отправляем код…' : 'Получить код'}</button>
            </>
          )}
          {step === 'code' && (
            <>
              <div className="small muted">Код пришёл в Telegram (чат «Telegram» на другом устройстве).</div>
              <label className="field">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="12345" autoFocus style={{ letterSpacing: '0.4em', fontWeight: 700 }} />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy || code.length < 5} onClick={confirm}>Войти</button>
            </>
          )}
          {step === 'password' && (
            <>
              <div className="small muted">У аккаунта включён облачный пароль (2FA).</div>
              <label className="field">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Облачный пароль" autoFocus />
              </label>
              <button className="btn btn-primary btn-block" disabled={busy || !password} onClick={confirm}>Подтвердить</button>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function TgSources({ account }: { account: LinkedAccount }) {
  const [dialogs, setDialogs] = useState<{ id: string; title: string; kind: string; enabled: boolean }[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setOpen(true);
    api.get<typeof dialogs>(`/api/accounts/${account.id}/dialogs`).then(setDialogs).catch((e) => setErr(e.message));
  };
  const toggle = async (d: NonNullable<typeof dialogs>[number], enabled: boolean) => {
    setDialogs((s) => s!.map((x) => (x.id === d.id ? { ...x, enabled } : x)));
    await api.post(`/api/accounts/${account.id}/sources`, { ref: d.id, title: d.title, enabled });
  };

  if (!open)
    return (
      <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={load}>
        Выбрать чаты-источники
      </button>
    );
  return (
    <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
      {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
      {!dialogs && !err && <div className="skeleton" style={{ height: 60 }} />}
      {dialogs?.map((d) => (
        <div key={d.id} className="row" style={{ padding: '8px 2px' }}>
          <span>{d.kind === 'channel' ? '📣' : '👥'}</span>
          <span className="small" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
          <Toggle on={d.enabled} onChange={(v) => toggle(d, v)} />
        </div>
      ))}
    </div>
  );
}

/* ───── публичные каналы парсера ───── */
function ChannelList() {
  const { me, toast } = useStore();
  const [list, setList] = useState<{ ref: string; enabled: boolean; builtIn: boolean }[]>([]);
  const [ref, setRef] = useState('');
  const load = () => api.get<typeof list>('/api/sources/telegram').then(setList);
  useEffect(() => void load(), []);

  const add = async (r: string, enabled = true) => {
    try {
      await api.post('/api/sources/telegram', { ref: r, enabled });
      setRef('');
      load();
      if (enabled) toast('Канал добавлен в парсер', 'ok');
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <>
      <div className="section-label">Telegram-каналы парсера · {list.filter((c) => c.enabled).length}</div>
      <div className="glass" style={{ padding: '6px 14px', borderRadius: 22 }}>
        {list.map((c) => (
          <div key={c.ref} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <button className="small" style={{ flex: 1, textAlign: 'left', fontWeight: 600 }} onClick={() => openLink(`https://t.me/${c.ref}`)}>
              @{c.ref}
            </button>
            {me?.admin ? <Toggle on={c.enabled} onChange={(v) => add(c.ref, v)} /> : <span className={`badge ${c.enabled ? 'badge-ok' : 'badge-soft'}`}>{c.enabled ? 'активен' : 'выкл'}</span>}
          </div>
        ))}
        {me?.admin && (
          <div className="row" style={{ padding: '10px 0 6px' }}>
            <label className="field" style={{ flex: 1, height: 42 }}>
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="@channel или t.me/…" autoCapitalize="off" />
            </label>
            <button className="icon-btn" onClick={() => add(ref)} disabled={ref.length < 4}>
              <Icon name="plus" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

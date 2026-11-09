import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Sheet, Toggle, softSpring, spring } from '../components/ui';
import { api, type User } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic } from '../lib/tg';
import { cx } from '../lib/util';

const RING_NAMES: Record<string, string> = { none: 'Без', aurora: 'Белая', sunset: 'Сталь', mint: 'Графит', mono: 'Пунктир', holo: 'Хром', fire: 'Комета', ice: 'Сияние' };
const PRO_RINGS = ['holo', 'fire', 'ice'];
const BANNER_NAMES: Record<string, string> = { nebula: 'Туманность', waves: 'Волны', grid: 'Сетка', prism: 'Призма', dusk: 'Сумерки', void: 'Пустота' };
const STATUS = ['', '🎨', '🚀', '🔥', '☕️', '🌙', '💎', '🧠', '🏝️'];

export function Profile() {
  const { me, setMe, billing, toast } = useStore();
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return null;

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await api.post<{ avatar: string }>('/api/me/avatar', fd);
      setMe({ ...me, avatar: r.avatar });
      haptic.ok();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const patch = async (p: Partial<User>) => {
    try {
      const u = await api.patch<User>('/api/me', p);
      setMe({ ...me, ...u });
    } catch (e) {
      haptic.err();
      toast((e as Error).message, 'err');
    }
  };

  const days = billing?.expiresAt ? Math.max(0, Math.ceil((billing.expiresAt - Date.now()) / 86400000)) : 0;

  return (
    <div className="screen" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
      <div className="content">
        <motion.div className={`banner banner-${me.banner}`} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring}>
          <button className="icon-btn glass liquid" style={{ position: 'absolute', right: 12, top: 12, zIndex: 2 }} onClick={() => setEditing(true)} aria-label="Редактировать">
            <Icon name="edit" size={19} />
          </button>
        </motion.div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -62, position: 'relative', zIndex: 2 }}>
          <motion.button initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.08 }} whileTap={{ scale: 0.94 }} onClick={() => fileRef.current?.click()} style={{ position: 'relative' }}>
            <Avatar user={me} size={122} glow />
            <span className="icon-btn glass strong" style={{ position: 'absolute', right: 0, bottom: 4, width: 36, height: 36, borderRadius: 99 }}>
              <Icon name="camera" size={17} />
            </span>
          </motion.button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>

        <motion.div style={{ textAlign: 'center', marginTop: 12 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.12 }}>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <h1 className="h1" style={{ fontSize: 26 }}>{me.nickname}</h1>
            {me.statusEmoji && <span style={{ fontSize: 22 }}>{me.statusEmoji}</span>}
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
            {me.pro && <span className="badge badge-accent"><Icon name="crown" size={13} stroke={2.2} /> PRO</span>}
            {me.admin && <span className="badge badge-soft">админ</span>}
          </div>
          <p className="muted" style={{ margin: '10px 20px 0' }}>{me.bio || <span className="faint">Расскажите о себе — в редакторе профиля</span>}</p>
        </motion.div>

        <div className="section-label">Подписка</div>
        <div className="glass" style={{ padding: 16, borderRadius: 24 }}>
          {billing?.pro ? (
            <>
              <div className="row">
                <div className="h3">Lumen Pro активен</div>
                <div className="spacer" />
                <span className="badge badge-ok">{days} дн.</span>
              </div>
              <div style={{ height: 6, borderRadius: 9, background: 'rgba(255,255,255,.08)', marginTop: 12, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (days / 30) * 100)}%` }} transition={{ ...softSpring, delay: 0.3 }} style={{ height: '100%', borderRadius: 9, background: '#fff' }} />
              </div>
              <div className="tiny muted" style={{ marginTop: 8 }}>
                до {new Date(billing.expiresAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · продлевается автоматически через Telegram Stars
              </div>
            </>
          ) : (
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="h3">Нет подписки</div>
                <div className="small muted">{billing?.priceRub ?? 270} ₽/мес — доступ к парсеру</div>
              </div>
              <span className="badge badge-soft">Free</span>
            </div>
          )}
        </div>

        <div className="section-label">Настройки</div>
        <div className="glass" style={{ padding: '4px 16px', borderRadius: 24 }}>
          <div className="row" style={{ padding: '12px 0' }}>
            <Icon name="bell" size={20} className="muted" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Пуши о лендингах в бота</div>
              <div className="tiny muted">Сразу, как парсер найдёт новый</div>
            </div>
            <Toggle on={!!me.notify} onChange={(v) => patch({ notify: v })} />
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <button className="row" style={{ padding: '14px 0', width: '100%' }} onClick={() => setEditing(true)}>
            <Icon name="sparkle" size={20} className="muted" />
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>Оформление профиля</span>
            <span className="tiny muted">{RING_NAMES[me.ring]} · {BANNER_NAMES[me.banner]}</span>
          </button>
        </div>
      </div>

      <EditProfile open={editing} onClose={() => setEditing(false)} me={me} patch={patch} />
    </div>
  );
}

function EditProfile({ open, onClose, me, patch }: { open: boolean; onClose: () => void; me: User; patch: (p: Partial<User>) => Promise<void> }) {
  const [nick, setNick] = useState(me.nickname);
  const [bio, setBio] = useState(me.bio);
  const { toast } = useStore();
  useEffect(() => {
    if (open) {
      setNick(me.nickname);
      setBio(me.bio);
    }
  }, [open]);

  const pickRing = (r: string) => {
    if (PRO_RINGS.includes(r) && !me.pro && !me.admin) {
      haptic.err();
      return toast('Эта обводка — для Pro', 'err');
    }
    haptic.select();
    patch({ ring: r });
  };

  const save = async () => {
    const p: Partial<User> = {};
    if (nick !== me.nickname) p.nickname = nick;
    if (bio !== me.bio) p.bio = bio;
    if (Object.keys(p).length) await patch(p);
    haptic.ok();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Оформление">
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 16px' }}>
        <Avatar user={me} size={92} glow />
      </div>

      <label className="field" style={{ marginBottom: 10 }}>
        <span className="faint">@</span>
        <input value={nick} onChange={(e) => setNick(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={20} placeholder="ник" autoCapitalize="off" />
      </label>
      <textarea className="area" rows={2} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={140} placeholder="Пара слов о себе: «Лендинги на Tilda за 5 дней»" />

      <div className="section-label">Обводка аватара</div>
      <div className="chips">
        {Object.keys(RING_NAMES).map((r) => (
          <motion.button key={r} whileTap={{ scale: 0.9 }} onClick={() => pickRing(r)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 'none', width: 62 }}>
            <div style={{ position: 'relative', padding: 3, borderRadius: 99, boxShadow: me.ring === r ? '0 0 0 2px var(--accent)' : 'none', transition: 'box-shadow .25s' }}>
              <Avatar user={me} size={50} ring={r} />
              {PRO_RINGS.includes(r) && !me.pro && <span style={{ position: 'absolute', right: -2, top: -2, fontSize: 12 }}>👑</span>}
            </div>
            <span className={cx('tiny', me.ring === r ? '' : 'muted')}>{RING_NAMES[r]}</span>
          </motion.button>
        ))}
      </div>

      <div className="section-label">Шапка профиля</div>
      <div className="pgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {Object.entries(BANNER_NAMES).map(([b, name]) => (
          <motion.button key={b} whileTap={{ scale: 0.95 }} onClick={() => (haptic.select(), patch({ banner: b }))} className={`banner banner-${b}`} style={{ height: 64, borderRadius: 16, boxShadow: me.banner === b ? '0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--line)' }}>
            <span className="tiny" style={{ position: 'absolute', left: 8, bottom: 6, zIndex: 2, fontWeight: 700 }}>{name}</span>
          </motion.button>
        ))}
      </div>

      <div className="section-label">Статус</div>
      <div className="chips">
        {STATUS.map((s) => (
          <button key={s || 'none'} className={cx('chip', me.statusEmoji === s && 'active')} style={{ fontSize: 18, isolation: 'isolate', minWidth: 46, justifyContent: 'center' }} onClick={() => (haptic.select(), patch({ statusEmoji: s }))}>
            {me.statusEmoji === s && <motion.div layoutId="status-pick" className="chip-bg" transition={spring} />}
            {s || <span className="small">—</span>}
          </button>
        ))}
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={save}>
        Готово
      </button>
    </Sheet>
  );
}

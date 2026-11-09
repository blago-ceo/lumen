import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { ProfileCard } from '../components/ProfileCard';
import { FONT_LABEL, Nick, PRESENCE_LABEL, PresenceIcon, ProfileBanner, gradCss } from '../components/ProfileBits';
import { Sheet, Toggle, softSpring, spring } from '../components/ui';
import { api, type User } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic } from '../lib/tg';
import { cx } from '../lib/util';

const RING_NAMES: Record<string, string> = { none: 'Без', aurora: 'Белая', sunset: 'Сталь', mint: 'Графит', mono: 'Пунктир', holo: 'Хром', fire: 'Комета', ice: 'Сияние' };
const PRO_RINGS = ['holo', 'fire', 'ice'];
const BANNER_NAMES: Record<string, string> = { nebula: 'Туманность', waves: 'Волны', grid: 'Сетка', prism: 'Призма', dusk: 'Сумерки', void: 'Пустота' };
const STATUS = ['', '🎨', '🚀', '🔥', '☕️', '🌙', '💎', '🧠', '🏝️'];
const PRESENCES = ['online', 'idle', 'dnd', 'invisible'] as const;

/** Готовые градиенты — быстрый выбор; свои цвета — через пипетку */
const GRAD_PRESETS = [
  '#ffffff,#8a8a8a',
  '#ff6ec4,#7873f5',
  '#00f5a0,#00d9f5',
  '#f7971e,#ffd200',
  '#fc466b,#3f5efb',
  '#a18cd1,#fbc2eb',
  '#43e97b,#38f9d7',
  '#ff0844,#ffb199',
  '#8e2de2,#4a00e0',
  '#f83600,#f9d423,#fe8c00',
];

export function Profile() {
  const { me, setMe, billing, toast } = useStore();
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (!me) return null;

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await api.post<{ url: string }>('/api/me/avatar', fd);
      setMe({ ...me, avatar: r.url });
      haptic.ok();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  const patch = async (p: Partial<User> & Record<string, unknown>) => {
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
        <ProfileCard
          u={me}
          self
          avatarAction={() => fileRef.current?.click()}
          bannerAction={
            <button className="icon-btn glass liquid" style={{ position: 'absolute', right: 12, top: 12, zIndex: 2 }} onClick={() => setEditing(true)} aria-label="Редактировать">
              <Icon name="edit" size={19} />
            </button>
          }
          actions={
            <button className="btn btn-ghost btn-block" onClick={() => setEditing(true)}>
              <Icon name="sparkle" size={18} /> Редактировать профиль
            </button>
          }
        />
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

        <div className="section-label">Статус сети</div>
        <div className="chips">
          {PRESENCES.map((p) => (
            <button key={p} className={cx('chip', (me.presencePref ?? 'online') === p && 'active')} style={{ isolation: 'isolate' }} onClick={() => (haptic.select(), patch({ presence: p as any }))}>
              {(me.presencePref ?? 'online') === p && <motion.div layoutId="presence-pick" className="chip-bg" transition={spring} />}
              <PresenceIcon p={p === 'invisible' ? 'invisible' : p} size={13} cut="transparent" />
              {PRESENCE_LABEL[p]}
            </button>
          ))}
        </div>

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
                <div className="small muted">{billing?.priceRub ?? 270} ₽/мес — парсер и автоотклики</div>
              </div>
              <span className="badge badge-soft">Free</span>
            </div>
          )}
        </div>

        <div className="section-label">Настройки</div>
        <div className="glass" style={{ padding: '4px 16px', borderRadius: 24 }}>
          <div className="row" style={{ padding: '12px 0' }}>
            <Icon name="bell" size={20} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Пуши о лендингах в бота</div>
              <div className="tiny muted">Сразу, как парсер найдёт новый</div>
            </div>
            <Toggle on={!!me.notify} onChange={(v) => patch({ notify: v })} />
          </div>
        </div>
      </div>

      <EditProfile open={editing} onClose={() => setEditing(false)} me={me} patch={patch} setMe={setMe} />
    </div>
  );
}

function GradPicker({ value, onChange, max = 3 }: { value: string; onChange: (v: string) => void; max?: number }) {
  const cols = value ? value.split(',') : [];
  const setAt = (i: number, c: string) => {
    const next = [...cols];
    next[i] = c;
    onChange(next.join(','));
  };
  return (
    <>
      <div className="chips">
        <button className={cx('swatch', !value && 'on')} onClick={() => onChange('')} aria-label="Без градиента">
          <Icon name="close" size={16} />
        </button>
        {GRAD_PRESETS.map((g) => (
          <button key={g} className={cx('swatch', value === g && 'on')} style={{ backgroundImage: gradCss(g, 135) }} onClick={() => (haptic.select(), onChange(g))} />
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {cols.map((c, i) => (
          <label key={i} className="color-dot" style={{ background: c }}>
            <input type="color" value={c} onChange={(e) => setAt(i, e.target.value)} />
          </label>
        ))}
        {cols.length > 0 && cols.length < max && (
          <button className="color-dot add" onClick={() => onChange([...cols, '#ffffff'].join(','))} aria-label="Добавить цвет">
            <Icon name="plus" size={14} />
          </button>
        )}
        {cols.length > 1 && (
          <button className="tiny muted" onClick={() => onChange(cols.slice(0, -1).join(','))}>
            убрать цвет
          </button>
        )}
        {cols.length === 0 && <span className="tiny faint">Выберите пресет или нажмите на цвет, чтобы настроить</span>}
      </div>
    </>
  );
}

function EditProfile({
  open,
  onClose,
  me,
  patch,
  setMe,
}: {
  open: boolean;
  onClose: () => void;
  me: User;
  patch: (p: Record<string, unknown>) => Promise<void>;
  setMe: (u: User) => void;
}) {
  const [nick, setNick] = useState(me.nickname);
  const [bio, setBio] = useState(me.bio);
  const [custom, setCustom] = useState(me.customStatus ?? '');
  const [nickGrad, setNickGrad] = useState(me.nickGrad ?? '');
  const [bannerGrad, setBannerGrad] = useState(me.bannerGrad ?? '');
  const [busy, setBusy] = useState(false);
  const bannerRef = useRef<HTMLInputElement>(null);
  const { toast } = useStore();
  useEffect(() => {
    if (open) {
      setNick(me.nickname);
      setBio(me.bio);
      setCustom(me.customStatus ?? '');
      setNickGrad(me.nickGrad ?? '');
      setBannerGrad(me.bannerGrad ?? '');
    }
  }, [open]);

  const preview: User = { ...me, nickname: nick || me.nickname, bio, customStatus: custom, nickGrad, bannerGrad };

  const pickRing = (r: string) => {
    if (PRO_RINGS.includes(r) && !me.pro && !me.admin) {
      haptic.err();
      return toast('Эта обводка — для Pro', 'err');
    }
    haptic.select();
    patch({ ring: r });
  };

  const uploadBanner = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>('/api/me/banner', fd);
      setMe({ ...me, bannerUrl: r.url });
      haptic.ok();
    } catch (e) {
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const p: Record<string, unknown> = {};
    if (nick !== me.nickname) p.nickname = nick;
    if (bio !== me.bio) p.bio = bio;
    if (custom !== (me.customStatus ?? '')) p.customStatus = custom;
    if (nickGrad !== (me.nickGrad ?? '')) p.nickGrad = nickGrad;
    if (bannerGrad !== (me.bannerGrad ?? '')) p.bannerGrad = bannerGrad;
    if (Object.keys(p).length) await patch(p);
    haptic.ok();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Профиль">
      {/* живой предпросмотр */}
      <div className="glass" style={{ borderRadius: 22, overflow: 'hidden', marginBottom: 6 }}>
        <ProfileBanner u={preview} height={86} radius={0} />
        {/* на шапку заходит только аватар, ник — ниже, на тёмном */}
        <div style={{ padding: '0 14px', marginTop: -30, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'inline-block', padding: 4, borderRadius: '50%', background: '#0d0d0d' }}>
            <Avatar user={me} size={60} />
          </div>
        </div>
        <div style={{ padding: '4px 16px 14px', minWidth: 0 }}>
          <Nick u={preview} style={{ fontSize: 20, fontWeight: 800 }} />
          {custom && <div className="tiny muted" style={{ marginTop: 2 }}>{custom}</div>}
        </div>
      </div>

      <div className="section-label">Ник</div>
      <label className="field" style={{ marginBottom: 10 }}>
        <span className="faint">@</span>
        <input value={nick} onChange={(e) => setNick(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} maxLength={20} placeholder="ник" autoCapitalize="off" />
      </label>

      <div className="section-label">Шрифт ника</div>
      <div className="pgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {Object.entries(FONT_LABEL).map(([f, name]) => (
          <button key={f} className={cx('font-pick glass', (me.nickFont ?? 'manrope') === f && 'on')} onClick={() => (haptic.select(), patch({ nickFont: f }))}>
            <Nick u={{ ...preview, nickFont: f }} style={{ fontSize: 17 }}>Aa</Nick>
            <span className="tiny muted">{name}</span>
          </button>
        ))}
      </div>

      <div className="section-label">Градиент ника</div>
      <GradPicker value={nickGrad} onChange={setNickGrad} />

      <div className="section-label">Фон профиля</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => bannerRef.current?.click()}>
          <Icon name="image" size={18} /> {busy ? 'Загружаю…' : 'Своя GIF / фото'}
        </button>
        {me.bannerUrl && (
          <button className="btn btn-ghost" onClick={() => patch({ bannerUrl: null })}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>
      <input ref={bannerRef} type="file" accept="image/*,.gif" hidden onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])} />
      <div className="tiny faint" style={{ margin: '6px 2px 10px' }}>GIF до 12 МБ — анимируется, без всяких подписок. Если картинки нет — используется градиент или пресет.</div>
      <GradPicker value={bannerGrad} onChange={setBannerGrad} />
      <div className="pgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 10 }}>
        {Object.entries(BANNER_NAMES).map(([b, name]) => (
          <motion.button
            key={b}
            whileTap={{ scale: 0.95 }}
            onClick={() => (haptic.select(), setBannerGrad(''), patch({ banner: b, bannerGrad: '' }))}
            className={`banner banner-${b}`}
            style={{ height: 56, borderRadius: 14, boxShadow: me.banner === b && !bannerGrad && !me.bannerUrl ? '0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--line)' }}
          >
            <span className="tiny" style={{ position: 'absolute', left: 8, bottom: 6, zIndex: 2, fontWeight: 700 }}>{name}</span>
          </motion.button>
        ))}
      </div>

      <div className="section-label">Свой статус</div>
      <label className="field">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="Например: беру лендинги на ноябрь" />
      </label>
      <div className="chips" style={{ marginTop: 8 }}>
        {STATUS.map((s) => (
          <button key={s || 'none'} className={cx('chip', me.statusEmoji === s && 'active')} style={{ fontSize: 18, isolation: 'isolate', minWidth: 46, justifyContent: 'center' }} onClick={() => (haptic.select(), patch({ statusEmoji: s }))}>
            {me.statusEmoji === s && <motion.div layoutId="status-pick" className="chip-bg" transition={spring} />}
            {s || <span className="small">—</span>}
          </button>
        ))}
      </div>

      <div className="section-label">Обо мне</div>
      <textarea className="area" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} placeholder="Лендинги на Tilda и Figma за 5 дней. Портфолио — по запросу." />
      <div className="tiny faint" style={{ textAlign: 'right', marginTop: 4 }}>{bio.length}/300</div>

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

      <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={save}>
        Сохранить
      </button>
    </Sheet>
  );
}

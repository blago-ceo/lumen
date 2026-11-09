/**
 * Кусочки «Discord-профиля»: значок сети, ник с градиентом и шрифтом, шапка с GIF/фото/градиентом.
 * Всё бесплатно — никакого нитро.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Presence, User } from '../lib/api';

export const PRESENCE_LABEL: Record<Presence | 'invisible', string> = {
  online: 'В сети',
  idle: 'Не активен',
  dnd: 'Не беспокоить',
  offline: 'Не в сети',
  invisible: 'Невидимка',
};

const PRESENCE_COLOR: Record<string, string> = { online: '#23a55a', idle: '#f0b232', dnd: '#f23f43', offline: '#80848e', invisible: '#80848e' };

/** Значок сети как в Discord: точка / месяц / «кирпич» / пустое кольцо */
export function PresenceIcon({ p, size = 14, cut = 'var(--bg)' }: { p: Presence | 'invisible'; size?: number; cut?: string }) {
  const c = PRESENCE_COLOR[p];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block', flex: 'none' }} aria-label={PRESENCE_LABEL[p]}>
      <circle cx="10" cy="10" r="10" fill={cut} />
      <mask id={`pm-${p}`}>
        <rect width="20" height="20" fill="#fff" />
        {p === 'idle' && <circle cx="6" cy="6" r="5.2" fill="#000" />}
        {p === 'dnd' && <rect x="5" y="8.2" width="10" height="3.6" rx="1.8" fill="#000" />}
        {(p === 'offline' || p === 'invisible') && <circle cx="10" cy="10" r="3.6" fill="#000" />}
      </mask>
      <circle cx="10" cy="10" r="7.4" fill={c} mask={`url(#pm-${p})`} />
    </svg>
  );
}

export const FONT_LABEL: Record<string, string> = {
  manrope: 'Обычный',
  unbounded: 'Широкий',
  mono: 'Моно',
  serif: 'Антиква',
  script: 'Рукопись',
  pixel: 'Пиксель',
};

export const gradCss = (g: string, angle = 90) => {
  const cols = g.split(',').filter(Boolean);
  if (!cols.length) return '';
  if (cols.length === 1) return cols[0];
  return `linear-gradient(${angle}deg, ${cols.join(', ')})`;
};

type NickUser = Pick<User, 'nickname'> & Partial<Pick<User, 'nickGrad' | 'nickFont'>>;

/** Ник с градиентом и выбранным шрифтом — везде, где он показывается */
export function Nick({ u, className, style, children }: { u: NickUser; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const g = u.nickGrad ? gradCss(u.nickGrad) : '';
  const isGrad = g.startsWith('linear');
  return (
    <span
      className={`nick nick-${u.nickFont || 'manrope'} ${className ?? ''}`}
      style={{
        ...(isGrad ? { backgroundImage: g, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : g ? { color: g } : {}),
        ...style,
      }}
    >
      {children ?? u.nickname}
    </span>
  );
}

/** Шапка: своя картинка/GIF → свой градиент → пресет */
export function ProfileBanner({ u, height = 150, radius, children }: { u: Partial<User>; height?: number; radius?: number; children?: ReactNode }) {
  const style: CSSProperties = { height, borderRadius: radius };
  let cls = `banner banner-${u.banner ?? 'nebula'}`;
  if (u.bannerUrl) {
    cls = 'banner banner-custom';
    style.backgroundImage = `url(${u.bannerUrl})`;
  } else if (u.bannerGrad) {
    cls = 'banner banner-custom';
    style.backgroundImage = gradCss(u.bannerGrad, 135);
  }
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

export const memberSince = (t?: number) =>
  t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Карточка профиля в стиле Discord — общая для «Профиля» и чужого профиля в шторке */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { User } from '../lib/api';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { Nick, PRESENCE_LABEL, PresenceIcon, ProfileBanner, memberSince } from './ProfileBits';
import { softSpring, spring } from './ui';

export function ProfileCard({
  u,
  self,
  bannerAction,
  avatarAction,
  actions,
  extra,
}: {
  u: User;
  self?: boolean;
  bannerAction?: ReactNode;
  avatarAction?: () => void;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  const shown = self ? (u.presencePref ?? 'online') : (u.presence ?? 'offline');
  return (
    <motion.div className="pcard glass" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={softSpring}>
      <ProfileBanner u={u} height={140}>
        {bannerAction}
      </ProfileBanner>

      <div className="pcard-head">
        <motion.button
          className="pcard-ava"
          whileTap={avatarAction ? { scale: 0.94 } : undefined}
          onClick={avatarAction}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.06 }}
          style={{ cursor: avatarAction ? 'pointer' : 'default' }}
        >
          <Avatar user={u} size={96} glow />
          <span className="pcard-presence">
            <PresenceIcon p={shown} size={26} cut="var(--card)" />
          </span>
          {avatarAction && (
            <span className="pcard-cam">
              <Icon name="camera" size={14} />
            </span>
          )}
        </motion.button>
        <div className="row" style={{ gap: 6, marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: 6 }}>
          {u.pro && (
            <span className="badge badge-accent">
              <Icon name="crown" size={12} stroke={2.2} /> PRO
            </span>
          )}
          {u.admin && <span className="badge badge-soft">админ</span>}
        </div>
      </div>

      <div className="pcard-body">
        <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Nick u={u} className="pcard-nick" />
          {u.statusEmoji && <span style={{ fontSize: 20 }}>{u.statusEmoji}</span>}
        </div>
        <div className="small muted" style={{ marginTop: 2 }}>
          @{u.nickname}
          {u.name ? ` · ${u.name}` : ''}
        </div>

        {(u.customStatus || shown) && (
          <div className="pcard-status">
            <PresenceIcon p={shown} size={12} cut="transparent" />
            <span>{u.customStatus || PRESENCE_LABEL[shown]}</span>
          </div>
        )}

        <div className="pcard-sect">
          <div className="pcard-label">Обо мне</div>
          <p className="pcard-bio">{u.bio || <span className="faint">{self ? 'Расскажите о себе — в редакторе' : 'Пока пусто'}</span>}</p>
        </div>
        {u.createdAt && (
          <div className="pcard-sect">
            <div className="pcard-label">В Lumen с</div>
            <div className="small">{memberSince(u.createdAt)}</div>
          </div>
        )}
        {extra}
        {actions && <div className="row" style={{ gap: 10, marginTop: 16 }}>{actions}</div>}
      </div>
    </motion.div>
  );
}

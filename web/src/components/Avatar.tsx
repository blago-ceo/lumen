import type { User } from '../lib/api';
import { avatarGradient } from '../lib/util';

interface Props {
  user: Pick<User, 'id' | 'nickname' | 'avatar' | 'ring'> & { online?: boolean };
  size?: number;
  ring?: string; // предпросмотр в редакторе
  glow?: boolean;
  showOnline?: boolean;
}

export function Avatar({ user, size = 44, ring, glow, showOnline }: Props) {
  const r = ring ?? user.ring ?? 'aurora';
  const w = r === 'none' ? 0 : Math.max(2, Math.round(size * 0.06));
  const gap = r === 'none' ? 0 : Math.max(2, Math.round(size * 0.045));
  const inner = w + gap;
  return (
    <div className="avatar" style={{ width: size, height: size }}>
      {glow && r !== 'none' && <div className={`ring-glow ring-${r}`} />}
      <div className={`avatar-ring ring-${r}`} />
      {/* зазор между кольцом и фото */}
      <div style={{ position: 'absolute', inset: w, borderRadius: '50%', background: 'var(--bg)' }} />
      <div
        className="avatar-img"
        style={{
          inset: inner,
          backgroundImage: user.avatar ? `url(${user.avatar})` : avatarGradient(user.id),
          fontSize: size * 0.38,
        }}
      >
        {!user.avatar && (user.nickname?.[0]?.toUpperCase() ?? '?')}
      </div>
      {showOnline && user.online && <div className="online-dot" />}
    </div>
  );
}

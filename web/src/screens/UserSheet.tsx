import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { api, type User } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic } from '../lib/tg';

export function UserSheet({ userId, onClose, onMessage }: { userId: number | null; onClose: () => void; onMessage: (id: number) => void }) {
  const [u, setU] = useState<User | null>(null);
  const { me, toast } = useStore();

  useEffect(() => {
    setU(null);
    if (userId) api.get<User>(`/api/users/${userId}`).then(setU);
  }, [userId]);

  const addFriend = async () => {
    if (!u) return;
    haptic.tap('medium');
    const r = await api.post<{ status: User['friendship'] }>(`/api/friends/${u.id}`);
    setU({ ...u, friendship: r.status });
    toast(r.status === 'friends' ? 'Теперь вы друзья' : 'Заявка отправлена', 'ok');
  };
  const removeFriend = async () => {
    if (!u) return;
    await api.del(`/api/friends/${u.id}`);
    setU({ ...u, friendship: 'none' });
  };

  return (
    <Sheet open={!!userId} onClose={onClose}>
      {u && (
        <div data-theme={u.theme} style={{ margin: '-10px -18px 0', padding: '0 18px' }}>
          <div className={`banner banner-${u.banner}`} style={{ height: 120, borderRadius: 26 }} />
          <div style={{ marginTop: -46, display: 'flex', justifyContent: 'center' }}>
            <Avatar user={u} size={96} glow showOnline />
          </div>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <span className="h2">{u.nickname}</span>
              {u.statusEmoji && <span style={{ fontSize: 20 }}>{u.statusEmoji}</span>}
              {u.pro && <span className="badge badge-accent">PRO</span>}
            </div>
            <div className="small muted" style={{ marginTop: 4 }}>
              {u.online ? 'в сети' : 'был(а) недавно'} · {u.friends ?? 0} друзей
            </div>
            {u.bio && <p style={{ margin: '12px 10px 0', color: 'var(--muted)' }}>{u.bio}</p>}
          </div>
          {me?.id !== u.id && (
            <div className="row" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onMessage(u.id)}>
                <Icon name="chat" size={18} /> Написать
              </button>
              {u.friendship === 'friends' ? (
                <button className="btn btn-ghost" onClick={removeFriend}>Удалить</button>
              ) : u.friendship === 'outgoing' ? (
                <button className="btn btn-ghost" disabled>Заявка отправлена</button>
              ) : (
                <button className="btn btn-ghost" onClick={addFriend}>
                  <Icon name="addUser" size={18} /> {u.friendship === 'incoming' ? 'Принять' : 'В друзья'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

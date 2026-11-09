import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { ProfileCard } from '../components/ProfileCard';
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
        <ProfileCard
          u={u}
          self={me?.id === u.id}
          extra={
            <div className="pcard-sect">
              <div className="pcard-label">Друзья</div>
              <div className="small">{u.friends ?? 0}</div>
            </div>
          }
          actions={
            me?.id !== u.id && (
              <>
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
              </>
            )
          }
        />
      )}
    </Sheet>
  );
}

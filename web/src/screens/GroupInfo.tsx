/** Шторка группы: название, эмодзи, участники, добавить/исключить, выйти */
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet, spring } from '../components/ui';
import { api, type Conversation, type User } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic } from '../lib/tg';
import { cx } from '../lib/util';
import { EMOJIS, UserRow } from './Chats';

export function GroupInfo({
  open,
  conv,
  onClose,
  onChange,
  onLeft,
  onProfile,
}: {
  open: boolean;
  conv: Conversation;
  onClose: () => void;
  onChange: (c: Conversation) => void;
  onLeft: () => void;
  onProfile: (uid: number) => void;
}) {
  const { me, toast } = useStore();
  const [title, setTitle] = useState(conv.title);
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const isOwner = conv.ownerId === me?.id;

  useEffect(() => {
    if (open) {
      setTitle(conv.title);
      setAdding(false);
    }
  }, [open]);
  useEffect(() => {
    if (adding) api.get<{ friends: User[] }>('/api/friends').then((r) => setFriends(r.friends));
  }, [adding]);

  const save = async (p: { title?: string; emoji?: string }) => {
    try {
      onChange(await api.patch<Conversation>(`/api/conversations/${conv.id}`, p));
      haptic.ok();
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  const add = async (uid: number) => {
    onChange(await api.post<Conversation>(`/api/conversations/${conv.id}/members`, { userIds: [uid] }));
    haptic.ok();
  };
  const kick = async (uid: number) => {
    try {
      onChange(await api.del<Conversation>(`/api/conversations/${conv.id}/members/${uid}`));
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };
  const leave = async () => {
    await api.del(`/api/conversations/${conv.id}/members/me`);
    onClose();
    onLeft();
  };

  const memberIds = new Set(conv.members.map((m) => m.id));
  const candidates = friends.filter((f) => !memberIds.has(f.id));

  return (
    <Sheet open={open} onClose={onClose} title={adding ? 'Добавить участников' : 'Группа'}>
      {adding ? (
        <>
          {candidates.length === 0 && <p className="small muted">Все ваши друзья уже в группе.</p>}
          {candidates.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => add(u.id)}>
              <Icon name="plus" size={20} />
            </UserRow>
          ))}
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setAdding(false)}>
            Готово
          </button>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 10 }}>
            <div className="glass" style={{ width: 52, height: 52, borderRadius: 18, display: 'grid', placeItems: 'center', fontSize: 24, flex: 'none' }}>{conv.emoji ?? '✦'}</div>
            <label className="field" style={{ flex: 1 }}>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={48} onBlur={() => title.trim() && title !== conv.title && save({ title })} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            </label>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {EMOJIS.map((e) => (
              <button key={e} className={cx('chip', conv.emoji === e && 'active')} style={{ fontSize: 18, padding: '0 12px', isolation: 'isolate' }} onClick={() => (haptic.select(), save({ emoji: e }))}>
                {conv.emoji === e && <motion.div layoutId="group-emoji" className="chip-bg" transition={spring} />}
                {e}
              </button>
            ))}
          </div>

          <div className="row section-label">
            <span>Участники · {conv.members.length}</span>
            <div className="spacer" />
            <button className="tiny" style={{ fontWeight: 700 }} onClick={() => setAdding(true)}>
              + добавить
            </button>
          </div>
          {conv.members.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => onProfile(u.id)}>
              {u.id === conv.ownerId && <span className="badge badge-soft">создатель</span>}
              {isOwner && u.id !== me?.id && (
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    kick(u.id);
                  }}
                  aria-label="Исключить"
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </UserRow>
          ))}

          <button className="btn btn-ghost btn-block" style={{ marginTop: 16, color: 'var(--danger)' }} onClick={leave}>
            <Icon name="logout" size={18} /> Выйти из группы
          </button>
        </>
      )}
    </Sheet>
  );
}

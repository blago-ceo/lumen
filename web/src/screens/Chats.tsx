import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Seg, Sheet, listItem, spring } from '../components/ui';
import { api, type Conversation, type User } from '../lib/api';
import { on, useStore } from '../lib/store';
import { haptic } from '../lib/tg';
import { ago, cx } from '../lib/util';
import { ChatRoom } from './ChatRoom';
import { UserSheet } from './UserSheet';

export function Chats() {
  const [seg, setSeg] = useState<'chats' | 'friends'>('chats');
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState<number | null>(null);
  const { toast } = useStore();

  const load = useCallback(() => api.get<Conversation[]>('/api/conversations').then(setConvs), []);
  useEffect(() => {
    load();
    return on('message:new', load);
  }, [load]);

  const openSupport = async () => {
    haptic.tap();
    const c = await api.post<Conversation>('/api/support');
    await load();
    setOpenId(c.id);
  };

  const openDirect = async (userId: number) => {
    const c = await api.post<Conversation>('/api/conversations/direct', { userId });
    setProfile(null);
    await load();
    setSeg('chats');
    setOpenId(c.id);
  };

  return (
    <div className="screen">
      <div className="content">
        <header className="row" style={{ marginBottom: 16 }}>
          <h1 className="h1">Чаты</h1>
          <div className="spacer" />
          <motion.button whileTap={{ scale: 0.9 }} className="icon-btn" onClick={() => setCreating(true)} aria-label="Новая группа">
            <Icon name="plus" />
          </motion.button>
        </header>

        <Seg value={seg} onChange={setSeg} options={[['chats', 'Диалоги'], ['friends', 'Друзья']]} />

        <AnimatePresence mode="wait" initial={false}>
          {seg === 'chats' ? (
            <motion.div key="c" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={spring}>
              {!convs?.some((c) => c.type === 'support') && (
                <motion.button whileTap={{ scale: 0.98 }} className="glass list-item" style={{ marginTop: 16, padding: 14 }} onClick={openSupport}>
                  <div className="icon-btn" style={{ width: 46, height: 46, borderRadius: 16, color: 'var(--accent)' }}>
                    <Icon name="life" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="h3">Поддержка</div>
                    <div className="small muted">Оплата, площадки, баги, идеи</div>
                  </div>
                  <Icon name="chev" size={18} className="faint" />
                </motion.button>
              )}

              <div className="col" style={{ gap: 2, marginTop: 12 }}>
                {convs === null ? (
                  [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 20 }} />)
                ) : convs.length === 0 ? (
                  <div className="empty">
                    <div className="big">💬</div>
                    <div className="h3">Здесь будут ваши диалоги</div>
                    <p className="small">Добавьте коллег в друзья и делитесь заказами прямо в чатах.</p>
                  </div>
                ) : (
                  convs.map((c, i) => (
                    <motion.button key={c.id} custom={i} variants={listItem} initial="hidden" animate="show" className="list-item" onClick={() => (haptic.tap(), setOpenId(c.id))}>
                      <ConvAvatar c={c} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                          <div className="h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                          {c.peer?.pro && <span className="badge badge-accent" style={{ height: 17, fontSize: 9.5, padding: '0 5px' }}>PRO</span>}
                          <div className="spacer" />
                          {c.lastMessage && <span className="tiny faint" style={{ flex: 'none' }}>{ago(c.lastMessage.createdAt)}</span>}
                        </div>
                        <div className="row" style={{ marginTop: 2 }}>
                          <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {preview(c)}
                          </div>
                          {c.unread > 0 && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="badge badge-accent" style={{ borderRadius: 99, minWidth: 22, justifyContent: 'center' }}>
                              {c.unread}
                            </motion.span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="f" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={spring}>
              <Friends onOpen={setProfile} onMessage={openDirect} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {createPortal(
        <AnimatePresence>{openId && <ChatRoom key={openId} id={openId} onClose={() => (setOpenId(null), load())} onProfile={setProfile} />}</AnimatePresence>,
        document.body,
      )}
      <CreateGroup
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          toast(`Группа «${c.title}» создана`, 'ok');
          load();
          setOpenId(c.id);
        }}
      />
      <UserSheet userId={profile} onClose={() => setProfile(null)} onMessage={openDirect} />
    </div>
  );
}

function preview(c: Conversation) {
  const m = c.lastMessage;
  if (!m) return 'Нет сообщений';
  const who = c.type !== 'direct' && m.sender && m.kind !== 'system' ? `${m.sender.nickname}: ` : '';
  if (m.kind === 'lead') return `${who}📌 ${m.payload?.title ?? 'Заказ'}`;
  return who + m.text;
}

export function ConvAvatar({ c, size = 52 }: { c: Conversation; size?: number }) {
  if (c.peer) return <Avatar user={c.peer} size={size} showOnline />;
  return (
    <div
      className="glass"
      style={{ width: size, height: size, borderRadius: size * 0.36, display: 'grid', placeItems: 'center', fontSize: size * 0.42, flex: 'none' }}
    >
      {c.type === 'support' ? '🛟' : c.emoji ?? '✦'}
    </div>
  );
}

/* ───── Друзья ───── */
function Friends({ onOpen, onMessage }: { onOpen: (id: number) => void; onMessage: (id: number) => void }) {
  const [data, setData] = useState<{ friends: User[]; incoming: User[]; outgoing: User[] } | null>(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<User[]>([]);
  const { toast } = useStore();

  const load = useCallback(() => api.get<typeof data>('/api/friends').then(setData), []);
  useEffect(() => {
    load();
    return on('friends:updated', load);
  }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => api.get<User[]>(`/api/users/search?q=${encodeURIComponent(q.trim())}`).then(setFound), 250);
    return () => clearTimeout(t);
  }, [q]);

  const accept = async (u: User) => {
    haptic.ok();
    await api.post(`/api/friends/${u.id}`);
    toast(`${u.nickname} теперь в друзьях`, 'ok');
    load();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <label className="field glass thin">
        <Icon name="search" size={19} className="faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти по нику" autoCapitalize="off" />
      </label>

      {found.length > 0 && (
        <>
          <div className="section-label">Найдено</div>
          {found.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => onOpen(u.id)} />
          ))}
        </>
      )}

      {!!data?.incoming.length && (
        <>
          <div className="section-label">Заявки · {data.incoming.length}</div>
          {data.incoming.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => onOpen(u.id)}>
              <button className="btn btn-primary btn-sm" onClick={(e) => (e.stopPropagation(), accept(u))}>
                Принять
              </button>
            </UserRow>
          ))}
        </>
      )}

      <div className="section-label">Друзья · {data?.friends.length ?? 0}</div>
      {data?.friends.length === 0 && <p className="small muted" style={{ margin: '0 4px' }}>Найдите коллег по нику — делитесь заказами и собирайте команду под проект.</p>}
      {data?.friends.map((u) => (
        <UserRow key={u.id} u={u} onClick={() => onOpen(u.id)}>
          <button className="icon-btn" onClick={(e) => (e.stopPropagation(), onMessage(u.id))} aria-label="Написать">
            <Icon name="chat" size={19} />
          </button>
        </UserRow>
      ))}

      {!!data?.outgoing.length && (
        <>
          <div className="section-label">Отправленные</div>
          {data.outgoing.map((u) => (
            <UserRow key={u.id} u={u} onClick={() => onOpen(u.id)}>
              <span className="badge badge-soft">ожидает</span>
            </UserRow>
          ))}
        </>
      )}
    </div>
  );
}

export function UserRow({ u, onClick, children, selected }: { u: User; onClick?: () => void; children?: React.ReactNode; selected?: boolean }) {
  return (
    <motion.div whileTap={{ scale: 0.98 }} className={cx('list-item')} onClick={onClick} style={{ cursor: 'pointer', background: selected ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : undefined }}>
      <Avatar user={u} size={46} showOnline />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className="h3">{u.nickname}</span>
          {u.statusEmoji && <span>{u.statusEmoji}</span>}
          {u.pro && <span className="badge badge-accent" style={{ height: 17, fontSize: 9.5, padding: '0 5px' }}>PRO</span>}
        </div>
        <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.online ? 'в сети' : u.bio || u.name || ''}</div>
      </div>
      {children}
    </motion.div>
  );
}

/* ───── Создание группы ───── */
const EMOJIS = ['✦', '🎨', '🚀', '💎', '🔥', '🌙', '⚡️', '🧩'];

function CreateGroup({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Conversation) => void }) {
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('✦');
  const [friends, setFriends] = useState<User[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const { toast } = useStore();

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setPicked(new Set());
    api.get<{ friends: User[] }>('/api/friends').then((r) => setFriends(r.friends));
  }, [open]);

  const create = async () => {
    try {
      const c = await api.post<Conversation>('/api/conversations/group', { title, emoji, memberIds: [...picked] });
      haptic.ok();
      onCreated(c);
    } catch (e) {
      toast((e as Error).message, 'err');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Новая группа">
      <div className="row" style={{ gap: 10 }}>
        <div className="glass" style={{ width: 50, height: 50, borderRadius: 18, display: 'grid', placeItems: 'center', fontSize: 24, flex: 'none' }}>{emoji}</div>
        <label className="field" style={{ flex: 1 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название, напр. «Лендинг-цех»" maxLength={48} />
        </label>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        {EMOJIS.map((e) => (
          <button key={e} className={cx('chip', emoji === e && 'active')} style={{ fontSize: 18, padding: '0 12px', isolation: 'isolate' }} onClick={() => (haptic.select(), setEmoji(e))}>
            {emoji === e && <motion.div layoutId="emoji-pick" className="chip-bg" transition={spring} />}
            {e}
          </button>
        ))}
      </div>
      <div className="section-label">Участники · {picked.size}</div>
      {friends.length === 0 && <p className="small muted">Сначала добавьте друзей — или создайте группу и пригласите позже.</p>}
      {friends.map((u) => (
        <UserRow
          key={u.id}
          u={u}
          selected={picked.has(u.id)}
          onClick={() => {
            haptic.select();
            setPicked((s) => {
              const n = new Set(s);
              n.has(u.id) ? n.delete(u.id) : n.add(u.id);
              return n;
            });
          }}
        >
          <motion.div
            animate={{ scale: picked.has(u.id) ? 1 : 0.85, opacity: picked.has(u.id) ? 1 : 0.35 }}
            className="icon-btn"
            style={{ width: 28, height: 28, borderRadius: 99, background: picked.has(u.id) ? 'var(--accent)' : undefined, color: 'var(--accent-ink)' }}
          >
            {picked.has(u.id) && <Icon name="check" size={16} stroke={2.6} />}
          </motion.div>
        </UserRow>
      ))}
      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} disabled={!title.trim()} onClick={create}>
        Создать группу
      </button>
    </Sheet>
  );
}

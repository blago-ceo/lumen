import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { spring } from '../components/ui';
import { api, type Conversation, type Lead, type Message } from '../lib/api';
import { on, sendWs, useStore } from '../lib/store';
import { haptic, openLink, showBack } from '../lib/tg';
import { clock, plural } from '../lib/util';
import { ConvAvatar } from './Chats';
import { GroupInfo } from './GroupInfo';
import { useCalls } from '../lib/calls';
import { Nick } from '../components/ProfileBits';
import { PlatformTag } from './LeadCard';

export function ChatRoom({ id, onClose, onProfile }: { id: number; onClose: () => void; onProfile: (uid: number) => void }) {
  const { me } = useStore();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const [info, setInfo] = useState(false);
  const { startCall } = useCalls();

  useEffect(() => showBack(onClose), [onClose]);

  useEffect(() => {
    api.get<Conversation>(`/api/conversations/${id}`).then(setConv);
    api.get<Message[]>(`/api/conversations/${id}/messages`).then((m) => {
      setMsgs(m);
      api.post(`/api/conversations/${id}/read`);
    });
    const off1 = on('message:new', (m: Message) => {
      if (m.conversationId !== id) return;
      setMsgs((s) => (s.some((x) => x.id === m.id) ? s : [...s, m]));
      if (m.sender?.id !== me?.id) {
        haptic.tap('soft');
        setTyping(null);
        api.post(`/api/conversations/${id}/read`);
      }
    });
    let t: number;
    const off2 = on('typing', (d: { conversationId: number; userId: number }) => {
      if (d.conversationId !== id) return;
      setTyping(d.userId);
      clearTimeout(t);
      t = window.setTimeout(() => setTyping(null), 3000);
    });
    return () => {
      off1();
      off2();
    };
  }, [id, me?.id]);

  useLayoutEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: msgs.length > 50 ? 'auto' : 'smooth' });
  }, [msgs.length, typing]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    haptic.tap();
    setText('');
    const m = await api.post<Message>(`/api/conversations/${id}/messages`, { text: body });
    setMsgs((s) => (s.some((x) => x.id === m.id) ? s : [...s, m]));
  };

  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      sendWs({ type: 'typing', conversationId: id });
    }
  };

  const typer = conv?.members.find((m) => m.id === typing);
  const online = conv?.members.filter((m) => m.online && m.id !== me?.id).length ?? 0;

  return (
    <motion.div className="overlay" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 40 }}>
      <div className="glass strong" style={{ borderRadius: '0 0 26px 26px', padding: 'calc(var(--safe-top) + 10px) 12px 12px', display: 'flex', alignItems: 'center', gap: 10, zIndex: 2 }}>
        <button className="icon-btn" onClick={onClose} aria-label="Назад">
          <Icon name="back" />
        </button>
        {conv && (
          <button className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => (conv.peer ? onProfile(conv.peer.id) : conv.type === 'group' && setInfo(true))}>
            <ConvAvatar c={conv} size={40} />
            <div style={{ minWidth: 0 }}>
              <div className="h3" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.peer ? <Nick u={conv.peer} /> : conv.title}</div>
              <div className="tiny muted">
                {typer
                  ? `${typer.nickname} печатает…`
                  : conv.type === 'direct'
                    ? conv.peer?.online
                      ? 'в сети'
                      : 'был(а) недавно'
                    : conv.type === 'support'
                      ? 'обычно отвечаем в течение дня'
                      : `${conv.members.length} ${plural(conv.members.length, 'участник', 'участника', 'участников')}${online ? ` · ${online} в сети` : ''}`}
              </div>
            </div>
          </button>
        )}
        {conv?.type === 'direct' && conv.peer && (
          <>
            <button className="icon-btn" onClick={() => startCall(conv.id, conv.peer!, false)} aria-label="Позвонить">
              <Icon name="call" size={20} />
            </button>
            <button className="icon-btn" onClick={() => startCall(conv.id, conv.peer!, true)} aria-label="Видеозвонок">
              <Icon name="video" size={20} />
            </button>
          </>
        )}
        {conv?.type === 'group' && (
          <button className="icon-btn" onClick={() => setInfo(true)} aria-label="О группе">
            <Icon name="users" size={20} />
          </button>
        )}
      </div>
      {conv?.type === 'group' && <GroupInfo open={info} conv={conv} onClose={() => setInfo(false)} onChange={setConv} onLeft={onClose} onProfile={onProfile} />}

      <div ref={list} style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {msgs.map((m, i) => {
          const mine = m.sender?.id === me?.id;
          const prev = msgs[i - 1];
          const firstOfGroup = !prev || prev.sender?.id !== m.sender?.id || prev.kind === 'system' || m.createdAt - prev.createdAt > 5 * 60_000;
          if (m.kind === 'system') return <div key={m.id} className="sys-msg">{m.text}</div>;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={spring}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: firstOfGroup ? 8 : 0, flexDirection: mine ? 'row-reverse' : 'row' }}
            >
              {!mine && conv?.type !== 'direct' && (
                <div style={{ width: 30, flex: 'none' }}>{firstOfGroup && m.sender && <button onClick={() => onProfile(m.sender!.id)}><Avatar user={m.sender} size={30} /></button>}</div>
              )}
              {m.kind === 'lead' ? (
                <LeadBubble lead={m.payload} mine={mine} time={m.createdAt} author={!mine && conv?.type !== 'direct' && firstOfGroup ? m.sender?.nickname : undefined} />
              ) : (
                <div className={`bubble ${mine ? 'me' : 'them'}`}>
                  {!mine && conv?.type !== 'direct' && firstOfGroup && <div className="tiny" style={{ fontWeight: 700, marginBottom: 2 }}>{m.sender && <Nick u={m.sender} />}</div>}
                  {m.text}
                  <span className="bubble-time">{clock(m.createdAt)}</span>
                </div>
              )}
            </motion.div>
          );
        })}
        <AnimatePresence>
          {typer && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bubble them" style={{ width: 62, display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6 }}>
              {[0, 1, 2].map((i) => (
                <motion.span key={i} style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--muted)' }} animate={{ y: [0, -4, 0] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="composer glass strong" style={{ borderRadius: '26px 26px 0 0' }}>
        <label className="field">
          <textarea
            rows={1}
            value={text}
            placeholder="Сообщение"
            onChange={(e) => {
              onType(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </label>
        <AnimatePresence>
          {text.trim() && (
            <motion.button
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 45 }}
              transition={spring}
              className="btn btn-primary"
              style={{ width: 46, height: 46, padding: 0, borderRadius: 23, flex: 'none' }}
              onClick={send}
              aria-label="Отправить"
            >
              <Icon name="send" size={20} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function LeadBubble({ lead, mine, time, author }: { lead: Lead; mine: boolean; time: number; author?: string }) {
  if (!lead) return null;
  return (
    <motion.button whileTap={{ scale: 0.98 }} className="glass" onClick={() => openLink(lead.url)} style={{ maxWidth: '82%', padding: 14, borderRadius: 20, textAlign: 'left', borderBottomRightRadius: mine ? 7 : 20, borderBottomLeftRadius: mine ? 20 : 7 }}>
      {author && <div className="tiny" style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 6 }}>{author}</div>}
      <div className="row" style={{ gap: 8 }}>
        <PlatformTag lead={lead} />
        {lead.isLanding && <span className="badge badge-accent" style={{ height: 19 }}>Лендинг</span>}
      </div>
      <div style={{ fontWeight: 700, margin: '8px 0 4px', lineHeight: 1.3 }}>{lead.title}</div>
      <div className="row small">
        <span style={{ fontWeight: 800 }}>{lead.budgetText ?? 'Бюджет не указан'}</span>
        <div className="spacer" />
        <span className="tiny faint">{clock(time)}</span>
      </div>
    </motion.button>
  );
}

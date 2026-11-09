import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Sheet, spring } from '../components/ui';
import { api, type Conversation, type Lead, type LinkedAccount } from '../lib/api';
import { useStore } from '../lib/store';
import { haptic, openLink } from '../lib/tg';
import { ago } from '../lib/util';
import { PlatformTag } from './LeadCard';

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onPatch: (id: string, p: Partial<Lead>) => void;
  onHide: (l: Lead) => void;
}

const TEMPLATE = (l: Lead) =>
  `Здравствуйте! Увидел ваш заказ «${l.title.slice(0, 60)}». Я веб-дизайнер, делаю лендинги под ключ: прототип → дизайн в Figma → сборка (Tilda/код). Могу показать похожие кейсы и назвать сроки. Удобно обсудить?`;

export function LeadSheet({ lead, onClose, onPatch, onHide }: Props) {
  const { toast } = useStore();
  const [mode, setMode] = useState<'view' | 'share' | 'reply'>('view');
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [tgAcc, setTgAcc] = useState<LinkedAccount | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode('view');
    if (lead) {
      setText(TEMPLATE(lead));
      api.get<{ items: LinkedAccount[] }>('/api/accounts').then((r) => setTgAcc(r.items.find((a) => a.platform === 'telegram' && a.status === 'active') ?? null));
    }
  }, [lead?.id]);

  if (!lead) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const tgContact = lead.contact?.split(',').map((s) => s.trim()).find((s) => s.startsWith('@'));

  const toggleSave = () => {
    haptic.tap('medium');
    onPatch(lead.id, { saved: !lead.saved });
    api.post(`/api/leads/${encodeURIComponent(lead.id)}/state`, { saved: !lead.saved });
    toast(lead.saved ? 'Убрано из сохранённых' : 'Сохранено', 'ok');
  };

  const openShare = async () => {
    setMode('share');
    setConvs(await api.get<Conversation[]>('/api/conversations'));
  };

  const shareTo = async (c: Conversation) => {
    setBusy(true);
    try {
      const { saved, seen, ...payload } = lead;
      await api.post(`/api/conversations/${c.id}/messages`, { kind: 'lead', text: '', payload });
      haptic.ok();
      toast(`Отправлено в «${c.title}»`, 'ok');
      setMode('view');
    } finally {
      setBusy(false);
    }
  };

  const sendReply = async () => {
    if (!tgAcc || !tgContact) return;
    setBusy(true);
    try {
      await api.post(`/api/accounts/${tgAcc.id}/send`, { to: tgContact, text });
      haptic.ok();
      toast(`Отправлено ${tgContact} от ${tgAcc.handle}`, 'ok');
      setMode('view');
    } catch (e) {
      haptic.err();
      toast((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!lead} onClose={onClose}>
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'view' && (
          <motion.div key="view" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={spring}>
            <div className="row" style={{ gap: 8 }}>
              <PlatformTag lead={lead} />
              <div className="spacer" />
              {lead.isLanding && <span className="badge badge-accent">Лендинг</span>}
            </div>
            <h2 className="h2" style={{ margin: '14px 0 8px', lineHeight: 1.25 }}>{lead.title}</h2>
            <div className="row small muted" style={{ gap: 12, flexWrap: 'wrap' }}>
              <span>{ago(lead.publishedAt)}</span>
              {lead.category && <span>· {lead.category}</span>}
            </div>

            <div className="glass thin" style={{ padding: '14px 16px', marginTop: 16, borderRadius: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div>
                <div className="tiny faint">БЮДЖЕТ</div>
                <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{lead.budgetText ?? 'Не указан'}</div>
              </div>
              {(lead.author || lead.contact) && (
                <>
                  <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="tiny faint">{lead.contact ? 'КОНТАКТ' : 'ЗАКАЗЧИК'}</div>
                    <button
                      className="row"
                      style={{ fontWeight: 700, marginTop: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        const c = tgContact ?? lead.author;
                        if (c?.startsWith('@')) openLink(`https://t.me/${c.slice(1)}`);
                        else if (lead.authorUrl) openLink(lead.authorUrl);
                        else if (lead.contact) {
                          navigator.clipboard?.writeText(lead.contact);
                          toast('Контакт скопирован', 'ok');
                        }
                      }}
                    >
                      {lead.contact ?? lead.author}
                    </button>
                  </div>
                </>
              )}
            </div>

            <p style={{ whiteSpace: 'pre-wrap', color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.55, margin: '16px 2px 20px' }}>{lead.description}</p>

            <div className="col" style={{ gap: 10, position: 'sticky', bottom: 0, paddingTop: 8, paddingBottom: 4, background: 'linear-gradient(transparent, rgba(8,8,8,.96) 30%)' }}>
              {tgAcc && tgContact ? (
                <button className="btn btn-primary btn-block" onClick={() => setMode('reply')}>
                  <Icon name="send" size={18} /> Написать {tgContact}
                </button>
              ) : (
                <button className="btn btn-primary btn-block" onClick={() => openLink(lead.url)}>
                  <Icon name="external" size={18} /> Откликнуться на {lead.platform === 'twogis' ? '2ГИС' : 'площадке'}
                </button>
              )}
              <div className="row" style={{ gap: 10 }}>
                {tgAcc && tgContact && (
                  <button className="icon-btn" onClick={() => openLink(lead.url)} aria-label="Открыть оригинал">
                    <Icon name="external" size={19} />
                  </button>
                )}
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={openShare}>
                  <Icon name="share" size={18} /> В чат
                </button>
                <motion.button whileTap={{ scale: 0.88 }} className={`icon-btn ${lead.saved ? 'on' : ''}`} onClick={toggleSave} aria-label="Сохранить">
                  <Icon name="bookmark" size={19} />
                </motion.button>
                <button className="icon-btn" onClick={() => onHide(lead)} aria-label="Скрыть">
                  <Icon name="trash" size={19} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {mode === 'share' && (
          <motion.div key="share" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring}>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className="icon-btn" onClick={() => setMode('view')}>
                <Icon name="back" />
              </button>
              <div className="h2">Поделиться</div>
            </div>
            {convs.length === 0 && <p className="muted small">Пока нет чатов — добавьте друзей или создайте группу во вкладке «Чаты».</p>}
            {convs.map((c) => (
              <button key={c.id} className="list-item" disabled={busy} onClick={() => shareTo(c)}>
                {c.peer ? <Avatar user={c.peer} size={44} /> : <div className="icon-btn" style={{ width: 44, height: 44, borderRadius: 16, fontSize: 20 }}>{c.emoji ?? '✦'}</div>}
                <div className="h3" style={{ flex: 1 }}>{c.title}</div>
                <Icon name="send" size={18} className="faint" />
              </button>
            ))}
          </motion.div>
        )}

        {mode === 'reply' && (
          <motion.div key="reply" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={spring}>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="icon-btn" onClick={() => setMode('view')}>
                <Icon name="back" />
              </button>
              <div>
                <div className="h2">Сообщение {tgContact}</div>
                <div className="small muted">от вашего аккаунта {tgAcc?.handle}</div>
              </div>
            </div>
            <textarea className="area" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="tiny faint" style={{ margin: '8px 4px 14px' }}>Отправляется одно сообщение вручную — без рассылок, чтобы аккаунт не словил спам-блок.</p>
            <button className="btn btn-primary btn-block" disabled={busy || !text.trim()} onClick={sendReply}>
              <Icon name="send" size={18} /> Отправить
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

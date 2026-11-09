/**
 * Звонки 1:1 (аудио/видео) поверх WebRTC. Сервер только пересылает сигналинг по WebSocket:
 * call:invite → call:accept → offer/answer/ice (call:signal) → call:end.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Nick } from '../components/ProfileBits';
import { on, sendWs, useStore } from './store';
import { haptic } from './tg';

type Peer = { id: number; nickname: string; avatar?: string | null; ring?: string; nickGrad?: string; nickFont?: string };
type Phase = 'outgoing' | 'incoming' | 'connecting' | 'active';
interface Call {
  id: string;
  conversationId: number;
  peer: Peer;
  video: boolean;
  phase: Phase;
  startedAt?: number;
}

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const Ctx = createContext<{ startCall: (conversationId: number, peer: Peer, video: boolean) => void; inCall: boolean }>({
  startCall: () => {},
  inCall: false,
});
export const useCalls = () => useContext(Ctx);

export function CallProvider({ children }: { children: ReactNode }) {
  const { toast } = useStore();
  const [call, setCall] = useState<Call | null>(null);
  const callRef = useRef<Call | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const update = (c: Call | null) => {
    callRef.current = c;
    setCall(c);
  };

  const send = (type: string, extra: Record<string, unknown> = {}) => {
    const c = callRef.current;
    if (c) sendWs({ type, conversationId: c.conversationId, callId: c.id, video: c.video, ...extra });
  };

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    pendingIce.current = [];
    setRemote(null);
    setMuted(false);
    setCamOff(false);
    update(null);
  }, []);

  const getMedia = async (video: boolean) => {
    local.current = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
    return local.current;
  };

  const makePc = () => {
    const p = new RTCPeerConnection(ICE);
    local.current?.getTracks().forEach((t) => p.addTrack(t, local.current!));
    p.onicecandidate = (e) => e.candidate && send('call:signal', { signal: { candidate: e.candidate.toJSON() } });
    p.ontrack = (e) => setRemote(e.streams[0]);
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected' && callRef.current) update({ ...callRef.current, phase: 'active', startedAt: Date.now() });
      if (p.connectionState === 'failed') {
        toast('Соединение потеряно', 'err');
        send('call:end');
        cleanup();
      }
    };
    pc.current = p;
    return p;
  };

  const flushIce = async () => {
    for (const c of pendingIce.current.splice(0)) await pc.current?.addIceCandidate(c).catch(() => {});
  };

  const startCall = useCallback(async (conversationId: number, peer: Peer, video: boolean) => {
    if (callRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) return toast('Звонки недоступны в этом браузере', 'err');
    update({ id: crypto.randomUUID(), conversationId, peer, video, phase: 'outgoing' });
    try {
      await getMedia(video);
      send('call:invite');
      haptic.tap('medium');
    } catch {
      toast('Нет доступа к микрофону/камере', 'err');
      cleanup();
    }
  }, []);

  const accept = async () => {
    const c = callRef.current;
    if (!c) return;
    try {
      await getMedia(c.video);
      makePc();
      update({ ...c, phase: 'connecting' });
      send('call:accept');
    } catch {
      toast('Нет доступа к микрофону/камере', 'err');
      send('call:decline');
      cleanup();
    }
  };

  const hangup = () => {
    const c = callRef.current;
    if (c) send(c.phase === 'incoming' ? 'call:decline' : 'call:end');
    cleanup();
  };

  useEffect(() => {
    const offs = [
      on('call:invite', (d: any) => {
        if (callRef.current) {
          sendWs({ type: 'call:busy', conversationId: d.conversationId, callId: d.callId });
          return;
        }
        haptic.tap('heavy');
        update({ id: d.callId, conversationId: d.conversationId, peer: d.from, video: d.video, phase: 'incoming' });
      }),
      on('call:accept', async (d: any) => {
        const c = callRef.current;
        if (!c || d.callId !== c.id) return;
        update({ ...c, phase: 'connecting' });
        const p = makePc();
        const offer = await p.createOffer();
        await p.setLocalDescription(offer);
        send('call:signal', { signal: { sdp: p.localDescription } });
      }),
      on('call:signal', async (d: any) => {
        const c = callRef.current;
        if (!c || d.callId !== c.id || !pc.current) return;
        const s = d.signal ?? {};
        if (s.sdp) {
          await pc.current.setRemoteDescription(s.sdp);
          if (s.sdp.type === 'offer') {
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            send('call:signal', { signal: { sdp: pc.current.localDescription } });
          }
          await flushIce();
        } else if (s.candidate) {
          if (pc.current.remoteDescription) await pc.current.addIceCandidate(s.candidate).catch(() => {});
          else pendingIce.current.push(s.candidate);
        }
      }),
      on('call:decline', (d: any) => {
        if (d.callId !== callRef.current?.id) return;
        toast('Звонок отклонён');
        cleanup();
      }),
      on('call:busy', (d: any) => {
        if (d.callId !== callRef.current?.id) return;
        toast('Собеседник уже разговаривает');
        cleanup();
      }),
      on('call:unavailable', () => {
        if (!callRef.current) return;
        toast('Собеседник не в сети');
        cleanup();
      }),
      on('call:end', (d: any) => {
        if (d.callId !== callRef.current?.id) return;
        cleanup();
      }),
    ];
    return () => offs.forEach((f) => f());
  }, []);

  // если никто не ответил за 40 секунд — сбрасываем
  useEffect(() => {
    if (call?.phase !== 'outgoing') return;
    const t = setTimeout(() => {
      toast('Не отвечает');
      hangup();
    }, 40_000);
    return () => clearTimeout(t);
  }, [call?.phase, call?.id]);

  const toggleMute = () => {
    const next = !muted;
    local.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };
  const toggleCam = () => {
    const next = !camOff;
    local.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
  };

  return (
    <Ctx.Provider value={{ startCall, inCall: !!call }}>
      {children}
      {createPortal(
        <AnimatePresence>
          {call && (
            <CallScreen
              call={call}
              local={local.current}
              remote={remote}
              muted={muted}
              camOff={camOff}
              onAccept={accept}
              onHangup={hangup}
              onMute={toggleMute}
              onCam={toggleCam}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

function Timer({ from }: { from: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(i);
  }, []);
  const s = Math.floor((Date.now() - from) / 1000);
  return <>{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}</>;
}

function CallScreen(p: {
  call: Call;
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  camOff: boolean;
  onAccept: () => void;
  onHangup: () => void;
  onMute: () => void;
  onCam: () => void;
}) {
  const { call } = p;
  const remoteV = useRef<HTMLVideoElement>(null);
  const remoteA = useRef<HTMLAudioElement>(null);
  const localV = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (remoteV.current) remoteV.current.srcObject = p.remote;
    if (remoteA.current) remoteA.current.srcObject = p.remote;
  }, [p.remote]);
  useEffect(() => {
    if (localV.current) localV.current.srcObject = p.local;
  }, [p.local, call.phase]);

  const hasRemoteVideo = call.video && !!p.remote?.getVideoTracks().length;
  const label =
    call.phase === 'incoming'
      ? call.video ? 'Входящий видеозвонок' : 'Входящий звонок'
      : call.phase === 'outgoing'
        ? 'Вызов…'
        : call.phase === 'connecting'
          ? 'Соединяю…'
          : null;

  return (
    <motion.div className="call" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }}>
      {hasRemoteVideo ? <video ref={remoteV} className="remote" autoPlay playsInline /> : <audio ref={remoteA} autoPlay />}
      {call.video && p.local && call.phase !== 'incoming' && <video ref={localV} className="local" autoPlay playsInline muted />}

      {!hasRemoteVideo && (
        <div className="call-info">
          <div style={{ position: 'relative' }}>
            {call.phase !== 'active' && <span className="call-pulse" />}
            <Avatar user={{ id: call.peer.id, nickname: call.peer.nickname, avatar: call.peer.avatar, ring: call.peer.ring ?? 'aurora' }} size={128} glow />
          </div>
          <Nick u={call.peer} style={{ fontSize: 26, fontWeight: 800 }} />
          <div className="muted">{label ?? (call.startedAt ? <Timer from={call.startedAt} /> : '')}</div>
        </div>
      )}

      <div className="call-ctrls">
        {call.phase === 'incoming' ? (
          <>
            <motion.button whileTap={{ scale: 0.9 }} className="call-btn end" onClick={p.onHangup} aria-label="Отклонить">
              <Icon name="hangup" size={26} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} className="call-btn accept" onClick={p.onAccept} aria-label="Принять" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              <Icon name={call.video ? 'video' : 'call'} size={26} />
            </motion.button>
          </>
        ) : (
          <>
            <motion.button whileTap={{ scale: 0.9 }} className={`call-btn ${p.muted ? 'off' : ''}`} onClick={p.onMute} aria-label="Микрофон">
              <Icon name={p.muted ? 'micOff' : 'mic'} size={24} />
            </motion.button>
            {call.video && (
              <motion.button whileTap={{ scale: 0.9 }} className={`call-btn ${p.camOff ? 'off' : ''}`} onClick={p.onCam} aria-label="Камера">
                <Icon name={p.camOff ? 'videoOff' : 'video'} size={24} />
              </motion.button>
            )}
            <motion.button whileTap={{ scale: 0.9 }} className="call-btn end" onClick={p.onHangup} aria-label="Завершить">
              <Icon name="hangup" size={26} />
            </motion.button>
          </>
        )}
      </div>
    </motion.div>
  );
}

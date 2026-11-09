import { AnimatePresence, motion, useDragControls, type PanInfo } from 'framer-motion';
import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic, showBack } from '../lib/tg';
import { useStore } from '../lib/store';
import { cx } from '../lib/util';

export const spring = { type: 'spring', stiffness: 520, damping: 40, mass: 0.9 } as const;
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

/* ───── нижняя шторка с drag-to-dismiss ───── */
export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode }) {
  const controls = useDragControls();
  useEffect(() => (open ? showBack(onClose) : undefined), [open, onClose]);
  const onDragEnd = (_: unknown, i: PanInfo) => {
    if (i.offset.y > 120 || i.velocity.y > 600) onClose();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
          <motion.div
            className="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div onPointerDown={(e) => controls.start(e)} style={{ touchAction: 'none', cursor: 'grab', paddingBottom: title ? 6 : 0 }}>
              <div className="sheet-grab" />
              {title && <div className="h2" style={{ marginBottom: 12 }}>{title}</div>}
            </div>
            <div className="sheet-body">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───── сегмент-контрол с перетекающим фоном ───── */
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="seg" style={{ isolation: 'isolate' }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          className={cx(value === v && 'active')}
          onClick={() => {
            haptic.select();
            onChange(v);
          }}
        >
          {value === v && <motion.div layoutId={`seg-${id}`} className="seg-bg" transition={spring} />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={cx('toggle', on && 'on')}
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic.select();
        onChange(!on);
      }}
    >
      <motion.div className="knob" animate={{ x: on ? 20 : 0 }} transition={spring} />
    </button>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toasts.slice(-1).map((t) => (
          <motion.div
            key={t.id}
            className="toast glass strong liquid"
            initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={spring}
            style={{ color: t.tone === 'err' ? 'var(--danger)' : undefined }}
          >
            {t.tone === 'ok' && '✦ '}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Каскадное появление элементов списка */
export const listItem = {
  hidden: { opacity: 0, y: 16, scale: 0.98, filter: 'blur(6px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { ...softSpring, delay: Math.min(i, 10) * 0.035 },
  }),
};

export function Press({ children, className, onClick, style }: { children: ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <motion.button
      className={className}
      style={style}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      onClick={() => {
        haptic.tap();
        onClick?.();
      }}
    >
      {children}
    </motion.button>
  );
}

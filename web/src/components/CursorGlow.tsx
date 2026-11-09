import { useEffect, useRef } from 'react';

/**
 * Свечение под мышкой: мягкое пятно света за курсором + подсветка кромки стеклянных карточек
 * (через CSS-переменные --mx/--my на ближайшем .glass). На тач-экранах выключено.
 */
export function CursorGlow() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    let x = -999;
    let y = -999;
    let lit: HTMLElement | null = null;
    const paint = () => {
      raf = 0;
      if (el.current) el.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.current?.classList.add('on');
      if (!raf) raf = requestAnimationFrame(paint);
      const g = (e.target as HTMLElement | null)?.closest?.('.glass') as HTMLElement | null;
      if (lit && lit !== g) {
        lit.style.removeProperty('--mx');
        lit.style.removeProperty('--my');
      }
      lit = g;
      if (g) {
        const r = g.getBoundingClientRect();
        g.style.setProperty('--mx', `${x - r.left}px`);
        g.style.setProperty('--my', `${y - r.top}px`);
      }
    };
    const leave = () => el.current?.classList.remove('on');
    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={el} className="cursor-glow" aria-hidden />;
}

const P: Record<string, string> = {
  feed: 'M4 6h16M4 12h10M4 18h7M17 15l2 2 3-4',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
  hub: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 0v9m0 0 8-4.5M12 12 4 7.5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-4.3-4.3',
  bookmark: 'M6 4h12v17l-6-4-6 4V4Z',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12 20 4l-6 16-3-7-7-1Z',
  back: 'M15 5l-7 7 7 7',
  chev: 'M9 5l7 7-7 7',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  share: 'M12 4v12M7 9l5-5 5 5M5 14v5h14v-5',
  sparkle: 'M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z',
  check: 'M5 12.5l4.5 4.5L19 7',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z',
  life: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5.6 5.6l3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0m1-9a3 3 0 1 0 0-6m2 15a6 6 0 0 0-3-5.2',
  addUser: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 12.5-4.3M19 14v6m-3-3h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1m-2 7.4-1 1A4 4 0 0 1 3.3 15l3-3a4 4 0 0 1 5.7 0',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5Z',
  crown: 'M4 18h16M5 15 3 7l5 3 4-6 4 6 5-3-2 8H5Z',
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v11H9V9Zm-4 6V4h10',
  download: 'M12 4v11m-5-5 5 5 5-5M5 20h14',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15h2',
  plane: 'M21 4 3 11l6 2.5L18 7l-7 8 .5 5 3-3.5 4 3L21 4Z',
  call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z',
  hangup: 'M3 14.5c4.8-4.6 13.2-4.6 18 0l-2.4 2.6-3.6-1.4v-2.6a11 11 0 0 0-6 0v2.6l-3.6 1.4L3 14.5Z',
  video: 'M3 7h12v10H3V7Zm12 3.5 6-3.5v10l-6-3.5',
  videoOff: 'M3 7h12v10H3V7Zm12 3.5 6-3.5v10l-6-3.5M3 3l18 18',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0m-7 7v3',
  micOff: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0m-7 7v3M3 3l18 18',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  image: 'M4 5h16v14H4V5Zm0 11 5-5 4 4 3-3 4 4M15 9.5h.01',
  wand: 'M5 19 15 9m2-5v3m3-1h-3m3 6v2m1-1h-2M12 3v2m1-1h-2',
};

/** Дизайн монохромный — цвет есть только у иконок. У каждой свой оттенок. */
const C: Record<string, string> = {
  feed: '#60a5fa', chat: '#34d399', hub: '#a78bfa', user: '#f472b6', search: '#38bdf8',
  bookmark: '#fbbf24', close: '#f87171', plus: '#4ade80', send: '#38bdf8', back: '#c084fc',
  chev: '#c084fc', external: '#22d3ee', share: '#818cf8', sparkle: '#facc15', check: '#4ade80',
  bell: '#fb923c', edit: '#f472b6', life: '#f87171', users: '#34d399', addUser: '#4ade80',
  link: '#60a5fa', trash: '#f87171', camera: '#22d3ee', filter: '#a78bfa', crown: '#facc15',
  pin: '#f87171', refresh: '#2dd4bf', logout: '#f87171', more: '#a3a3a3', copy: '#818cf8',
  download: '#4ade80', phone: '#38bdf8', plane: '#38bdf8',
  call: '#4ade80', hangup: '#f87171', video: '#38bdf8', videoOff: '#f87171', mic: '#4ade80', micOff: '#f87171',
  bolt: '#facc15', image: '#22d3ee', wand: '#c084fc',
};

export function Icon({ name, size = 22, stroke = 1.8, className, color }: { name: keyof typeof P | string; size?: number; stroke?: number; className?: string; color?: string }) {
  const dim = className?.includes('faint') || className?.includes('muted');
  return (
    <svg
      className={[className, dim && 'ico-dim'].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? C[name] ?? 'currentColor'}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={P[name] ?? P.sparkle} />
    </svg>
  );
}

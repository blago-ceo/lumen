/** Аврора, зерно и SVG-фильтр «жидкого стекла» (используется в backdrop-filter: url(#lumen-liquid)) */
export function Background() {
  return (
    <>
      <div className="aurora" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="lumen-liquid" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          {/* низкочастотный шум → мягкие «волны» преломления, как у толстого стекла */}
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" result="refract" />
          {/* лёгкая хроматическая аберрация по краям */}
          <feColorMatrix in="refract" type="matrix" values="1.06 0 0 0 0  0 1 0 0 0  0 0 1.1 0 0  0 0 0 1 0" />
        </filter>
      </svg>
    </>
  );
}

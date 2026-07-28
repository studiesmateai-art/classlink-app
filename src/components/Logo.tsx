export function Logo({ size = 32, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <div className="brand">
      <span className="logo-mark" style={{ width: size, height: size, fontSize: size * 0.46 }}>
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z" />
          <path d="M7 9.5V15c0 1.4 2.24 2.5 5 2.5s5-1.1 5-2.5V9.5" />
        </svg>
      </span>
      {showText && <span className="brand-text">ClassLink</span>}
    </div>
  )
}

/** Saans mark: two strokes of breath curling around a single particle. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="23" cy="9" r="3" fill="#ecedee" />
      <path d="M4 14.5 H17.5 a4.5 4.5 0 1 0 -4.3 -5.9" fill="none" stroke="#ecedee" strokeWidth="2.6" strokeLinecap="square" />
      <path d="M4 20.5 H22 a4 4 0 1 1 -3.8 5.2" fill="none" stroke="#9fd7ff" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
  );
}

/** The 3x3 dot grid mark. */
export function Logo({ size = 16 }: { size?: number }) {
  const dots = [3, 8, 13].flatMap((y) => [3, 8, 13].map((x) => ({ x, y })));
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {dots.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x - 1.25} y={y - 1.25} width={2.5} height={2.5} fill="currentColor" />
      ))}
    </svg>
  );
}

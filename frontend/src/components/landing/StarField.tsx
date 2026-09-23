// A small star cluster, echoing the app's core metaphor: documents become
// points of knowledge, connected into constellations you can query.
const STARS = [
  { x: 62, y: 8, r: 0.22, twinkle: true },
  { x: 71, y: 14, r: 0.14 },
  { x: 68, y: 22, r: 0.18, twinkle: true },
  { x: 79, y: 19, r: 0.11 },
  { x: 76, y: 30, r: 0.24, twinkle: true },
  { x: 85, y: 27, r: 0.14 },
  { x: 90, y: 12, r: 0.15 },
  { x: 58, y: 24, r: 0.11 },
  { x: 82, y: 40, r: 0.17, twinkle: true },
  { x: 94, y: 34, r: 0.13 },
  { x: 65, y: 36, r: 0.13 },
  { x: 88, y: 6, r: 0.19, twinkle: true },
];

const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 5],
  [2, 4],
  [4, 5],
  [5, 8],
  [8, 9],
  [3, 6],
];

export default function StarField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(ellipse_60%_70%_at_75%_15%,black,transparent)]"
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMin slice">
        {LINKS.map(([a, b], i) => (
          <line
            key={i}
            x1={STARS[a].x}
            y1={STARS[a].y}
            x2={STARS[b].x}
            y2={STARS[b].y}
            stroke="#8b2fd6"
            strokeWidth="0.05"
            opacity="0.35"
          />
        ))}
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={i % 3 === 0 ? "#0891a8" : "#e01cc0"}
            opacity="0.6"
            className={s.twinkle ? "animate-glow-pulse" : undefined}
          />
        ))}
      </svg>
    </div>
  );
}

const LEAVES = [
  { x: 60, y: 120, r: -35, s: 1.5 },
  { x: 1250, y: 60, r: 30, s: 1.6 },
  { x: 700, y: -10, r: 8, s: 1.3 },
  { x: -20, y: 620, r: -70, s: 1.5 },
  { x: 1380, y: 560, r: 65, s: 1.7 },
  { x: 640, y: 860, r: -10, s: 1.5 },
  { x: 300, y: 30, r: -15, s: 1.1 },
  { x: 1000, y: 880, r: 20, s: 1.2 },
]

export default function LeafBackground() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="lf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#242e49" />
          <stop offset="1" stopColor="#102552" />
        </linearGradient>

        <pattern
          id="vein"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(62)"
        >
          <rect width="5" height="14" fill="#99cdd8" opacity=".16" />
        </pattern>

        <radialGradient id="vg" cx=".5" cy=".5" r=".75">
          <stop offset=".35" stopColor="#102552" stopOpacity=".05" />
          <stop offset="1" stopColor="#2b2d31" stopOpacity=".88" />
        </radialGradient>
      </defs>

      <rect width="1440" height="900" fill="#102552" />

      {LEAVES.map((leaf, index) => (
        <g
          key={index}
          transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.r}) scale(${leaf.s})`}
          opacity=".82"
        >
          <ellipse cx="0" cy="0" rx="120" ry="230" fill="url(#lf)" />
          <ellipse cx="0" cy="0" rx="120" ry="230" fill="url(#vein)" />
          <line
            x1="0"
            y1="-225"
            x2="0"
            y2="225"
            stroke="#99cdd8"
            strokeOpacity=".22"
            strokeWidth="3"
          />
        </g>
      ))}

      <rect width="1440" height="900" fill="url(#vg)" />
    </svg>
  )
}

export interface Slice { label: string; value: number; color: string }

/** SVG donut chart with a centered total. */
export function Donut({ data, size = 168, thickness = 26, centerLabel }: {
  data: Slice[]; size?: number; thickness?: number; centerLabel?: string
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
          {total > 0 && data.map((d, i) => {
            const len = (d.value / total) * c
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={d.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
                strokeLinecap="butt" />
            )
            offset += len
            return el
          })}
        </g>
        <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: 26, fontWeight: 800, fill: '#0B2E5E' }}>{total}</text>
        {centerLabel && <text x="50%" y="62%" textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: 12, fill: '#64748b' }}>{centerLabel}</text>}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map((d) => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: d.color, display: 'inline-block' }} />
            <span style={{ color: '#334155' }}>{d.label}</span>
            <b style={{ color: '#0B2E5E' }}>{d.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/** SVG area/line chart for the 7-day passenger trend. */
export function LineChart({ data, height = 200, color = '#F07E1B' }: {
  data: { label: string; passengers: number }[]; height?: number; color?: string
}) {
  const W = 640, H = height, padL = 34, padR = 14, padT = 16, padB = 28
  const iw = W - padL - padR, ih = H - padT - padB
  const max = Math.max(10, ...data.map((d) => d.passengers))
  const nice = Math.ceil(max / 10) * 10
  const n = data.length
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw)
  const y = (v: number) => padT + ih - (v / nice) * ih
  const pts = data.map((d, i) => [x(i), y(d.passengers)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${padT + ih} L${x(0).toFixed(1)},${padT + ih} Z`
  const grid = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: '100%' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {grid.map((g, i) => {
        const gy = padT + ih - g * ih
        return <g key={i}>
          <line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#eef2f7" strokeWidth="1" />
          <text x={padL - 6} y={gy + 4} textAnchor="end" style={{ fontSize: 10, fill: '#94a3b8' }}>{Math.round(g * nice)}</text>
        </g>
      })}
      <path d={area} fill="url(#areaGrad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="#fff" stroke={color} strokeWidth="2.5" />
          <text x={p[0]} y={p[1] - 10} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: '#0B2E5E' }}>{data[i].passengers}</text>
          <text x={p[0]} y={H - 8} textAnchor="middle" style={{ fontSize: 10, fill: '#64748b' }}>{data[i].label}</text>
        </g>
      ))}
    </svg>
  )
}

/** Horizontal fill bars — one per route/line. */
export function BarList({ data }: { data: { name: string; occupancy: number; occupied: number; capacity: number }[] }) {
  const color = (p: number) => (p >= 80 ? '#e11d48' : p >= 50 ? '#F07E1B' : '#16a34a')
  if (!data.length) return <div style={{ color: '#94a3b8', padding: '18px 0' }}>لا توجد رحلات للغد بعد.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((d) => (
        <div key={d.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
            <span style={{ fontWeight: 600, color: '#0B2E5E' }}>{d.name}</span>
            <span style={{ color: '#64748b' }}>{d.occupied}/{d.capacity} · {d.occupancy}%</span>
          </div>
          <div style={{ height: 12, borderRadius: 8, background: '#eef2f7', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(d.occupancy, 100)}%`, height: '100%', borderRadius: 8, background: color(d.occupancy), transition: 'width .5s' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

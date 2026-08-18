import { Tooltip } from 'antd'

export type SeatState = 'empty' | 'held' | 'booked' | 'term' | 'mine' | 'selected'

export interface SeatCell { number: number; state: SeatState; student?: string; raw_state?: string }

interface Props {
  layout: { id: string; name: string; rows: (number | string)[][] }
  seats: SeatCell[]
  selected?: number | null
  onSelect?: (n: number) => void
  staff?: boolean
}

// Palette per state (ELKADY brand).
const STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  empty:    { bg: '#ffffff', fg: '#8a4b16', border: '#f3c896' },
  selected: { bg: '#0B2E5E', fg: '#ffffff', border: '#0B2E5E' },
  mine:     { bg: '#16a34a', fg: '#ffffff', border: '#15803d' },
  held:     { bg: '#F9B233', fg: '#4a3200', border: '#e09b18' },
  booked:   { bg: '#F07E1B', fg: '#ffffff', border: '#d86c10' },
  term:     { bg: '#64748b', fg: '#ffffff', border: '#475569' },
}

function Seat({ cell, selected, onSelect, staff }: { cell: SeatCell; selected: boolean; onSelect?: (n: number) => void; staff?: boolean }) {
  const state: string = selected ? 'selected' : cell.state
  const s = STYLE[state] || STYLE.empty
  const clickable = onSelect && (cell.state === 'empty' || cell.state === 'selected' || selected)
  const seat = (
    <div
      onClick={() => clickable && onSelect!(cell.number)}
      style={{
        width: 40, height: 40, borderRadius: 9, background: s.bg, color: s.fg,
        border: `2px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13, cursor: clickable ? 'pointer' : 'default',
        boxShadow: '0 2px 0 rgba(0,0,0,0.08)', position: 'relative', transition: 'transform .08s',
      }}
      onMouseDown={(e) => clickable && ((e.currentTarget.style.transform = 'scale(0.94)'))}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {state === 'term' ? '🔒' : cell.number}
      {state === 'term' && <span style={{ position: 'absolute', bottom: -2, fontSize: 9 }}>{cell.number}</span>}
    </div>
  )
  const label = staff && cell.student
    ? `مقعد ${cell.number} — ${cell.student}`
    : cell.state === 'term' ? `مقعد ${cell.number} — محجوز بالترم`
    : cell.state === 'booked' ? `مقعد ${cell.number} — محجوز`
    : cell.state === 'held' ? `مقعد ${cell.number} — معلق`
    : cell.state === 'mine' ? `مقعد ${cell.number} — مقعدك`
    : `مقعد ${cell.number} — متاح`
  return <Tooltip title={label}>{seat}</Tooltip>
}

export default function SeatMap({ layout, seats, selected, onSelect, staff }: Props) {
  const byNum = new Map(seats.map((s) => [s.number, s]))
  return (
    <div style={{ display: 'inline-block', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, color: '#0B2E5E', marginBottom: 12 }}>{layout.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
        {layout.rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            {row.map((cell, ci) => {
              if (cell === 'D') return (
                <div key={ci} style={{ width: 40, height: 40, borderRadius: 9, background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚍</div>
              )
              if (cell === 'x') return <div key={ci} style={{ width: 40, height: 40 }} />
              const c = byNum.get(cell as number) || { number: cell as number, state: 'empty' as SeatState }
              return <Seat key={ci} cell={c} selected={selected === cell} onSelect={onSelect} staff={staff} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SeatLegend() {
  const items: [string, string][] = [
    ['متاح', '#ffffff'], ['مقعدك', '#16a34a'], ['معلق', '#F9B233'], ['محجوز', '#F07E1B'], ['مقفول بالترم', '#64748b'],
  ]
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, background: color, border: '1.5px solid #cbd5e1', display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
  )
}

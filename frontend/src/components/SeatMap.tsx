import { Tooltip } from 'antd'

export type SeatState = 'empty' | 'held' | 'booked' | 'term' | 'mine' | 'selected'

export interface SeatCell { number: number; state: SeatState; student?: string; raw_state?: string; gender?: string }

interface Props {
  layout: { id: string; name: string; rows: (number | string)[][] }
  seats: SeatCell[]
  selected?: number | null
  onSelect?: (n: number) => void
  staff?: boolean
  viewerGender?: string   // when set (student), block picking the other gender's seats
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
// Gender tint for AVAILABLE gendered seats.
const GENDER = {
  female: { bg: '#fdf2f8', border: '#ec4899', fg: '#9d174d', icon: '♀' },
  male:   { bg: '#eff6ff', border: '#3b82f6', fg: '#1e40af', icon: '♂' },
}

function Seat({ cell, selected, onSelect, staff, viewerGender }: {
  cell: SeatCell; selected: boolean; onSelect?: (n: number) => void; staff?: boolean; viewerGender?: string
}) {
  const g = cell.gender as 'female' | 'male' | undefined
  const genderBlocked = !!(viewerGender && g && g !== viewerGender)
  const isEmpty = cell.state === 'empty'
  const state: string = selected ? 'selected' : cell.state

  let s = STYLE[state] || STYLE.empty
  // Available gendered seats get the gender tint (unless selected).
  if (isEmpty && !selected && g) s = { bg: GENDER[g].bg, fg: GENDER[g].fg, border: GENDER[g].border }

  const clickable = !!onSelect && (isEmpty || selected) && !genderBlocked
  const seat = (
    <div
      onClick={() => clickable && onSelect!(cell.number)}
      style={{
        width: 40, height: 40, borderRadius: 9, background: s.bg, color: s.fg,
        border: `2px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 13, cursor: clickable ? 'pointer' : 'default',
        boxShadow: '0 2px 0 rgba(0,0,0,0.08)', position: 'relative', transition: 'transform .08s',
        opacity: genderBlocked ? 0.4 : 1,
      }}
      onMouseDown={(e) => clickable && (e.currentTarget.style.transform = 'scale(0.94)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {state === 'term' ? '🔒' : cell.number}
      {isEmpty && g && !selected && (
        <span style={{ position: 'absolute', top: -6, insetInlineEnd: -4, fontSize: 12, color: GENDER[g].border }}>{GENDER[g].icon}</span>
      )}
      {state === 'term' && <span style={{ position: 'absolute', bottom: -2, fontSize: 9 }}>{cell.number}</span>}
    </div>
  )
  const genderTxt = g === 'female' ? ' — مقعد إناث' : g === 'male' ? ' — مقعد ذكور' : ''
  const label = staff && cell.student
    ? `مقعد ${cell.number} — ${cell.student}${genderTxt}`
    : cell.state === 'term' ? `مقعد ${cell.number} — محجوز بالترم`
    : cell.state === 'booked' ? `مقعد ${cell.number} — محجوز`
    : cell.state === 'held' ? `مقعد ${cell.number} — معلق`
    : cell.state === 'mine' ? `مقعد ${cell.number} — مقعدك`
    : genderBlocked ? `مقعد ${cell.number}${genderTxt} (غير متاح لك)`
    : `مقعد ${cell.number} — متاح${genderTxt}`
  return <Tooltip title={label}>{seat}</Tooltip>
}

export default function SeatMap({ layout, seats, selected, onSelect, staff, viewerGender }: Props) {
  const byNum = new Map(seats.map((s) => [s.number, s]))
  return (
    <div style={{ display: 'inline-block', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, color: '#0B2E5E', marginBottom: 4 }}>{layout.name}</div>
      <div style={{ textAlign: 'left', fontSize: 11, color: '#64748b', marginBottom: 8 }}>🚍 مقعد السائق (يسار = اتجاه القيادة)</div>
      {/* LTR so the driver sits on the left, matching the real vehicle orientation. */}
      <div style={{ direction: 'ltr', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
        {layout.rows.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            {row.map((cell, ci) => {
              if (cell === 'D') return (
                <div key={ci} style={{ width: 40, height: 40, borderRadius: 9, background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚍</div>
              )
              if (cell === 'x') return <div key={ci} style={{ width: 40, height: 40 }} />
              const c = byNum.get(cell as number) || { number: cell as number, state: 'empty' as SeatState }
              return <Seat key={ci} cell={c} selected={selected === cell} onSelect={onSelect} staff={staff} viewerGender={viewerGender} />
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SeatLegend() {
  const items: [string, string][] = [
    ['متاح', '#ffffff'], ['مقعدك', '#16a34a'], ['معلق', '#F9B233'], ['محجوز', '#F07E1B'],
    ['مقفول بالترم', '#64748b'], ['مقعد إناث ♀', '#fdf2f8'], ['مقعد ذكور ♂', '#eff6ff'],
  ]
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
      {items.map(([label, color]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ width: 16, height: 16, borderRadius: 5, background: color, border: '1.5px solid #cbd5e1', display: 'inline-block' }} />
          {label}
        </div>
      ))}
    </div>
  )
}

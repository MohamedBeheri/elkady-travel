import { useState } from 'react'
import { Button, Space, App as AntdApp } from 'antd'

interface Props {
  layout: { id: string; name: string; rows: (number | string)[][] }
  female: string   // comma-separated seat numbers
  male: string
  onSave: (v: { female_seats: string; male_seats: string }) => Promise<any> | void
  saving?: boolean
}

const parse = (s: string) =>
  new Set(String(s || '').replace(/،/g, ',').split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)).map(Number))

const GENDER = {
  female: { bg: '#fdf2f8', border: '#ec4899', fg: '#9d174d', icon: '♀' },
  male: { bg: '#eff6ff', border: '#3b82f6', fg: '#1e40af', icon: '♂' },
  none: { bg: '#ffffff', border: '#f3c896', fg: '#8a4b16', icon: '' },
}

/** Click a seat to cycle: عادي → إناث → ذكور → عادي. Admin sets seat genders visually. */
export default function SeatGenderEditor({ layout, female, male, onSave, saving }: Props) {
  const [fem, setFem] = useState<Set<number>>(parse(female))
  const [mal, setMal] = useState<Set<number>>(parse(male))
  const { message } = AntdApp.useApp()

  const cycle = (n: number) => {
    const f = new Set(fem), m = new Set(mal)
    if (f.has(n)) { f.delete(n); m.add(n) }        // female → male
    else if (m.has(n)) { m.delete(n) }             // male → none
    else { f.add(n) }                              // none → female
    setFem(f); setMal(m)
  }

  const genderOf = (n: number) => (fem.has(n) ? 'female' : mal.has(n) ? 'male' : 'none')

  const save = async () => {
    const sorted = (s: Set<number>) => Array.from(s).sort((a, b) => a - b).join(',')
    await onSave({ female_seats: sorted(fem), male_seats: sorted(mal) })
    message.success('تم حفظ تخصيص المقاعد')
  }

  return (
    <div>
      <div style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
        اضغط على المقعد للتبديل: <b style={{ color: '#8a4b16' }}>عادي</b> ← <b style={{ color: '#9d174d' }}>إناث ♀</b> ← <b style={{ color: '#1e40af' }}>ذكور ♂</b> ← عادي.
      </div>
      <div style={{ display: 'inline-block', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
        <div style={{ textAlign: 'center', fontWeight: 700, color: '#0B2E5E', marginBottom: 12 }}>{layout.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {layout.rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 8 }}>
              {row.map((cell, ci) => {
                if (cell === 'D') return <div key={ci} style={{ width: 40, height: 40, borderRadius: 9, background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🚍</div>
                if (cell === 'x') return <div key={ci} style={{ width: 40, height: 40 }} />
                const n = cell as number
                const g = genderOf(n)
                const s = GENDER[g as keyof typeof GENDER]
                return (
                  <div key={ci} onClick={() => cycle(n)}
                    style={{ width: 40, height: 40, borderRadius: 9, background: s.bg, color: s.fg, border: `2px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, cursor: 'pointer', position: 'relative', boxShadow: '0 2px 0 rgba(0,0,0,0.08)' }}>
                    {n}
                    {s.icon && <span style={{ position: 'absolute', top: -6, insetInlineEnd: -4, fontSize: 12, color: s.border }}>{s.icon}</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button type="primary" loading={saving} onClick={save}>حفظ التخصيص</Button>
        <Space size="large" style={{ fontSize: 13 }}>
          <span><b style={{ color: '#9d174d' }}>♀ إناث:</b> {fem.size}</span>
          <span><b style={{ color: '#1e40af' }}>♂ ذكور:</b> {mal.size}</span>
        </Space>
      </div>
    </div>
  )
}

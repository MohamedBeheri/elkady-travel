import { Card, DatePicker, Table, Tag, Space, Button, Collapse, Empty, Select } from 'antd'
import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  useDayManifestQuery, useRoutesQuery, useUniversitiesQuery, useMorningSlotsQuery, useReturnSlotsQuery,
  useDestinationsQuery,
} from '../app/api'
import { StudentLink } from '../components/StudentProfileModal'
import { SHOW_SEAT_NUMBERS } from '../app/uiFlags'

const CAT_LABEL: Record<string, string> = { go_only: 'ذهاب فقط', return_only: 'عودة فقط', round_trip: 'ذهاب وعودة' }
const CAT_COLOR: Record<string, string> = { go_only: 'blue', return_only: 'purple', round_trip: 'green' }
const CATS = ['go_only', 'return_only', 'round_trip'] as const
const SUB_TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }

function legLabel(leg: any) {
  if (!leg) return '—'
  return `${leg.time || '—'}${SHOW_SEAT_NUMBERS && leg.seat ? ` · مقعد ${leg.seat}` : ''}`
}

function passengerColumns() {
  return [
    { title: 'الطالب', dataIndex: 'student_name', width: 170, render: (v: string, r: any) => <StudentLink id={r.student_id} name={v} /> },
    { title: 'الهاتف', dataIndex: 'student_phone', width: 120 },
    { title: 'الجامعة', dataIndex: 'university', render: (v: string) => v || '—' },
    { title: 'نقطة الالتقاط', dataIndex: 'pickup', render: (v: string) => v || '—' },
    {
      title: 'نوع الاشتراك', dataIndex: 'subscription_type',
      render: (v: string) => <Tag color="cyan" style={{ whiteSpace: 'normal', display: 'inline-block' }}>{v}</Tag>,
    },
    { title: 'الذهاب', dataIndex: 'go', render: legLabel },
    { title: 'العودة', dataIndex: 'return', render: legLabel },
  ]
}

function flattenRows(routes: any[]) {
  const rows: any[] = []
  for (const r of routes) {
    for (const cat of CATS) {
      for (const p of r[cat] || []) {
        rows.push({
          route: r.route_name, destination: r.destination_name, category: CAT_LABEL[cat],
          student_name: p.student_name, student_phone: p.student_phone,
          university: p.university, pickup: p.pickup, subscription_type: p.subscription_type,
          go_time: p.go?.time || '', go_seat: p.go?.seat ?? '',
          return_time: p.return?.time || '', return_seat: p.return?.seat ?? '',
        })
      }
    }
  }
  return rows
}

function downloadCSV(routes: any[], date: string) {
  const rows = flattenRows(routes)
  const head = ['المسار', 'الوجهة', 'الفئة', 'الطالب', 'الهاتف', 'الجامعة', 'نقطة الالتقاط', 'نوع الاشتراك',
    'موعد الذهاب', ...(SHOW_SEAT_NUMBERS ? ['مقعد الذهاب'] : []), 'موعد العودة', ...(SHOW_SEAT_NUMBERS ? ['مقعد العودة'] : [])]
  const body = rows.map((r) => [
    r.route, r.destination, r.category, r.student_name, r.student_phone, r.university, r.pickup, r.subscription_type,
    r.go_time, ...(SHOW_SEAT_NUMBERS ? [r.go_seat] : []), r.return_time, ...(SHOW_SEAT_NUMBERS ? [r.return_seat] : []),
  ])
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [head, ...body].map((row) => row.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = `day-manifest-${date}.csv`
  a.click(); URL.revokeObjectURL(url)
}

function exportPDF(routes: any[], date: string, totals: any) {
  const sections = routes.map((r: any) => {
    const catBlocks = CATS.map((cat) => {
      const list = r[cat] || []
      if (!list.length) return ''
      const trs = list.map((p: any, i: number) => `<tr>${[
        i + 1, p.student_name, p.student_phone, p.university || '—', p.pickup || '—',
        p.subscription_type || '—', legLabel(p.go), legLabel(p.return),
      ].map((c: any) => `<td>${c}</td>`).join('')}</tr>`).join('')
      return `<tr class="cat"><td colspan="8">${CAT_LABEL[cat]} (${list.length})</td></tr>${trs}`
    }).join('')
    return `<tr class="rt"><td colspan="8">🚌 ${r.route_name} (${r.destination_name}) — إجمالي ${r.totals.total}</td></tr>${catBlocks}`
  }).join('')
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>كشف اليوم الشامل</title><style>
    body{font-family:'Cairo',Arial,sans-serif;padding:22px;color:#0f172a}
    .hd{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0B2E5E;padding-bottom:10px;margin-bottom:6px}
    .hd img{width:52px;height:52px;border-radius:50%}
    .hd .t{font-weight:800;font-size:20px;color:#0B2E5E}
    .hd .s{font-size:12px;color:#EC6A16;font-weight:700;letter-spacing:1px}
    .meta{color:#475569;font-size:13px;margin:8px 0 14px}
    .meta b{color:#0B2E5E}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #cbd5e1;padding:5px 6px;text-align:center}
    th{background:#0B2E5E;color:#fff}
    tr.rt td{background:#0B2E5E;color:#fff;font-weight:800;text-align:right}
    tr.cat td{background:#fff6ee;color:#8a4b16;font-weight:800;text-align:right}
    .ft{margin-top:22px;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:10px}
    .ft b{color:#EC6A16}
    @media print{body{padding:0}}</style></head>
    <body>
    <div class="hd"><img src="/logo.png" onerror="this.style.display='none'"/>
      <div><div class="t">القاضي — ELKADY TRAVEL</div><div class="s">كشف اليوم الشامل — كل الاشتراكات</div></div></div>
    <div class="meta">التاريخ: <b>${date}</b> · ذهاب فقط: <b>${totals.go_only}</b> · عودة فقط: <b>${totals.return_only}</b> · ذهاب وعودة: <b>${totals.round_trip}</b> · الإجمالي: <b>${totals.total}</b></div>
    <table><thead><tr><th>#</th><th>الطالب</th><th>الهاتف</th><th>الجامعة</th><th>نقطة الالتقاط</th><th>نوع الاشتراك</th><th>الذهاب</th><th>العودة</th></tr></thead>
    <tbody>${sections}</tbody></table>
    <div class="ft">تصميم وتطوير <b>شركة كفو للبرمجيات</b> · Kaffo.co</div>
    </body></html>`
  // Hidden iframe instead of window.open → not blocked by popup blockers.
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open(); doc.write(html); doc.close()
  const print = () => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() }
    finally { setTimeout(() => document.body.removeChild(iframe), 1500) }
  }
  const img = doc.querySelector('img') as HTMLImageElement | null
  if (img && !img.complete) { img.onload = print; img.onerror = print; setTimeout(print, 1500) }
  else setTimeout(print, 300)
}

export default function DayManifest() {
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const ds = date.format('YYYY-MM-DD')
  // Polls so admin-decisions elsewhere (a student's own attendance change, or the
  // scheduled auto-lock/auto-allocation cron) show up here without a manual reload.
  const { data, isFetching } = useDayManifestQuery({ date: ds }, { pollingInterval: 60000 })
  const { data: routesData } = useRoutesQuery({ active: true })
  const { data: unisData } = useUniversitiesQuery({ active: true })
  const { data: mSlotsData } = useMorningSlotsQuery()
  const { data: rSlotsData } = useReturnSlotsQuery()
  const { data: destsData } = useDestinationsQuery()
  const allRoutes = data?.routes || []

  const [routeFilter, setRouteFilter] = useState<number>()
  const [destFilter, setDestFilter] = useState<number>()
  const [catFilter, setCatFilter] = useState<string>()
  const [subTypeFilter, setSubTypeFilter] = useState<string>()
  const [uniFilter, setUniFilter] = useState<string>()
  const [slotFilter, setSlotFilter] = useState<string>()

  const passes = (p: any) =>
    (!subTypeFilter || p.subscription_type_code === subTypeFilter) &&
    (!uniFilter || p.university === uniFilter) &&
    (!slotFilter || p.go?.time === slotFilter || p.return?.time === slotFilter)

  const routes = useMemo(() => allRoutes
    .filter((r: any) => !routeFilter || r.route_id === routeFilter)
    .filter((r: any) => !destFilter || r.destination_id === destFilter)
    .map((r: any) => {
      const out: any = { route_id: r.route_id, route_name: r.route_name, destination_name: r.destination_name }
      for (const cat of CATS) {
        out[cat] = (!catFilter || catFilter === cat) ? (r[cat] || []).filter(passes) : []
      }
      out.totals = {
        go_only: out.go_only.length, return_only: out.return_only.length, round_trip: out.round_trip.length,
        total: out.go_only.length + out.return_only.length + out.round_trip.length,
      }
      return out
    })
    .filter((r: any) => r.totals.total > 0),
  [allRoutes, routeFilter, destFilter, catFilter, subTypeFilter, uniFilter, slotFilter])

  const totals = useMemo(() => routes.reduce((acc: any, r: any) => ({
    go_only: acc.go_only + r.totals.go_only, return_only: acc.return_only + r.totals.return_only,
    round_trip: acc.round_trip + r.totals.round_trip, total: acc.total + r.totals.total,
  }), { go_only: 0, return_only: 0, round_trip: 0, total: 0 }), [routes])

  const routeOptions = (routesData?.results || []).map((r: any) => ({ value: r.id, label: r.name }))
  const uniOptions = (unisData?.results || []).map((u: any) => ({ value: u.name, label: u.name }))
  const destOptions = (destsData?.results || destsData || []).map((d: any) => ({ value: d.id, label: d.name }))

  // The موعد options depend on which trip-direction filter is active right now —
  // go slots only for "ذهاب فقط", return slots only for "عودة فقط", both otherwise.
  const mSlots = (mSlotsData?.results || mSlotsData || [])
  const rSlots = (rSlotsData?.results || rSlotsData || [])
  const slotNames = catFilter === 'go_only' ? mSlots
    : catFilter === 'return_only' ? rSlots
    : [...mSlots, ...rSlots]
  const slotOptions = Array.from(new Set(slotNames.map((s: any) => s.name)))
    .map((name) => ({ value: name, label: name as string }))

  return (
    <Card
      title="كشف اليوم الشامل"
      extra={
        <Space wrap>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
          <Button icon={<FileExcelOutlined />} disabled={!routes.length} onClick={() => downloadCSV(routes, ds)}>Excel</Button>
          <Button icon={<FilePdfOutlined />} disabled={!routes.length} onClick={() => exportPDF(routes, ds, totals)}>PDF</Button>
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Select placeholder="المسار" allowClear style={{ width: 180 }} value={routeFilter} onChange={setRouteFilter} options={routeOptions} />
        <Select placeholder="الوجهة" allowClear style={{ width: 140 }} value={destFilter} onChange={setDestFilter} options={destOptions} />
        <Select placeholder="نوع الرحلة" allowClear style={{ width: 150 }} value={catFilter}
          onChange={(v) => { setCatFilter(v); setSlotFilter(undefined) }}
          options={CATS.map((c) => ({ value: c, label: CAT_LABEL[c] }))} />
        <Select placeholder="الموعد" allowClear style={{ width: 170 }} value={slotFilter} onChange={setSlotFilter}
          options={slotOptions} />
        <Select placeholder="نوع الاشتراك" allowClear style={{ width: 140 }} value={subTypeFilter} onChange={setSubTypeFilter}
          options={Object.entries(SUB_TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select placeholder="الجامعة" allowClear style={{ width: 200 }} value={uniFilter} onChange={setUniFilter}
          showSearch optionFilterProp="label" options={uniOptions} />
      </Space>

      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 16, padding: '8px 12px', background: '#f8fafc',
        border: '1px solid #e5e7eb', borderRadius: 8,
      }}>
        <span style={{ color: '#64748b', fontSize: 12 }}>
          كشف يجمع كل الطلاب — ترم وشهري ويومي معاً — لهذا اليوم، مقسّم لكل خط حسب الاتجاه.
        </span>
        <Space wrap style={{ marginInlineStart: 'auto' }}>
          <Tag color="blue" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>ذهاب فقط: <b>{totals.go_only}</b></Tag>
          <Tag color="purple" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>عودة فقط: <b>{totals.return_only}</b></Tag>
          <Tag color="green" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>ذهاب وعودة: <b>{totals.round_trip}</b></Tag>
          <Tag color="gold" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>الإجمالي: <b>{totals.total}</b></Tag>
        </Space>
      </div>

      {!isFetching && routes.length === 0 && <Empty description="لا يوجد ركاب مطابقون لهذا الفلتر" />}

      {routes.length > 0 && (
        <Collapse
          key={routes.map((r: any) => r.route_id).join(',')}
          defaultActiveKey={routes.map((r: any) => r.route_id)}
          items={routes.map((r: any) => ({
            key: r.route_id,
            label: (
              <Space wrap>
                <b>{r.route_name}</b>
                <Tag>{r.destination_name}</Tag>
                <Tag color="blue">ذهاب فقط: {r.totals.go_only}</Tag>
                <Tag color="purple">عودة فقط: {r.totals.return_only}</Tag>
                <Tag color="green">ذهاب وعودة: {r.totals.round_trip}</Tag>
              </Space>
            ),
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={16}>
                {CATS.map((cat) => (r[cat]?.length ? (
                  <div key={cat}>
                    <Tag color={CAT_COLOR[cat]} style={{ fontWeight: 700, marginBottom: 8 }}>
                      {CAT_LABEL[cat]} ({r[cat].length})
                    </Tag>
                    <Table
                      size="small" rowKey="student_id" pagination={false} dataSource={r[cat]}
                      scroll={{ x: 900 }} columns={passengerColumns()}
                    />
                  </div>
                ) : null))}
              </Space>
            ),
          }))}
        />
      )}
    </Card>
  )
}

import { Card, DatePicker, Button, Table, Tag, Drawer, App as AntdApp, Space, Empty, Progress, Divider, Modal, List, Tooltip } from 'antd'
import { ThunderboltOutlined, FilePdfOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useTripBoardQuery, useRunAllocationMutation, useTripPassengersQuery,
  useSeatmapQuery, useReleaseSeatMutation, useSeatRequestsQuery, useConfirmSeatMutation,
  useDeleteEmptyTripMutation,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'
import { SHOW_SEAT_NUMBERS } from '../app/uiFlags'

function SeatManager({ trip }: { trip: any }) {
  const { modal, message } = AntdApp.useApp()
  const { data } = useSeatmapQuery(trip.id)
  const { data: held } = useSeatRequestsQuery({ daily_trip: trip.id, status: 'held' })
  const [release] = useReleaseSeatMutation()
  const [confirm] = useConfirmSeatMutation()

  const onSeat = (n: number) => {
    const seat = data?.seats?.find((s: any) => s.number === n)
    if (!seat || seat.state === 'empty') return
    modal.confirm({
      title: SHOW_SEAT_NUMBERS ? `فحت المقعد رقم ${n}؟` : 'فحت هذا المقعد؟',
      content: seat.state === 'term'
        ? `المقعد محجوز بالترم (${seat.student}). سيتم تحريره لهذا اليوم فقط (غياب).`
        : `المقعد (${seat.student || ''}) سيتم تحريره وإتاحته لطالب آخر.`,
      okText: 'فحت المقعد', okButtonProps: { danger: true },
      onOk: async () => { await release({ id: trip.id, seat_number: n }); message.success('تم تحرير المقعد') },
    })
  }

  return (
    <div>
      {(held?.results || []).length > 0 && (
        <Card size="small" title="حجوزات معلّقة بانتظار تأكيد الدفع" style={{ marginBottom: 16 }}>
          <List
            size="small" dataSource={held?.results || []}
            renderItem={(r: any) => (
              <List.Item actions={[
                <Button key="c" size="small" type="primary" onClick={async () => { await confirm(r.id); message.success('تم تأكيد الدفع') }}>تأكيد الدفع</Button>,
              ]}>
                <List.Item.Meta title={SHOW_SEAT_NUMBERS ? `${r.student_name} — مقعد ${r.seat_number}` : r.student_name} description={r.university_name} />
              </List.Item>
            )}
          />
        </Card>
      )}
      {data && (
        <div style={{ textAlign: 'center' }}>
          <SeatMap layout={data.layout} seats={data.seats} staff onSelect={onSeat} />
          <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
          <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>اضغط على أي مقعد محجوز لتحريره (فحت) — مقاعد الترم تُحرّر لليوم فقط عند الغياب.</div>
        </div>
      )}
    </div>
  )
}

function manifestPDF(trip: any, data: any) {
  const cols = SHOW_SEAT_NUMBERS ? 6 : 5
  const sections = (data.groups || []).map((g: any) => {
    const rows = (g.passengers || []).map((p: any, i: number) => `<tr>${[
      i + 1, ...(SHOW_SEAT_NUMBERS ? [p.seat_number ?? ''] : []), p.student_name ?? '', p.university ?? '', p.student_phone ?? '', p.kind ?? '',
    ].map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')
    return `<tr class="grp"><td colspan="${cols}">⏰ ${g.time || '—'} — ${g.pickup} (${(g.passengers || []).length} راكب)</td></tr>${rows}`
  }).join('')
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>كشف ركاب — ${trip.route_name || ''}</title><style>
    body{font-family:'Cairo',Arial,sans-serif;padding:22px;color:#0f172a}
    .hd{display:flex;align-items:center;gap:12px;border-bottom:3px solid #0B2E5E;padding-bottom:10px;margin-bottom:6px}
    .hd img{width:52px;height:52px;border-radius:50%}
    .hd .t{font-weight:800;font-size:20px;color:#0B2E5E}
    .hd .s{font-size:12px;color:#EC6A16;font-weight:700;letter-spacing:1px}
    .meta{color:#475569;font-size:13px;margin:8px 0 14px}
    .meta b{color:#0B2E5E}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center}
    th{background:#0B2E5E;color:#fff}
    tr.grp td{background:#fff6ee;color:#8a4b16;font-weight:800;text-align:right}
    .ft{margin-top:22px;text-align:center;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;padding-top:10px}
    .ft b{color:#EC6A16}
    @media print{body{padding:0}}</style></head>
    <body>
    <div class="hd"><img src="/logo.png" onerror="this.style.display='none'"/>
      <div><div class="t">القاضي — ELKADY TRAVEL</div><div class="s">كشف ركاب الرحلة</div></div></div>
    <div class="meta">المسار: <b>${trip.route_name || ''}</b> · الموعد: <b>${trip.slot_name || ''}</b> · الوجهة: <b>${trip.destination_name || ''}</b> · التاريخ: <b>${trip.date || ''}</b> · إجمالي الركاب: <b>${data.total ?? 0}</b></div>
    <table><thead><tr><th>#</th>${SHOW_SEAT_NUMBERS ? '<th>مقعد</th>' : ''}<th>الطالب</th><th>الجامعة</th><th>الهاتف</th><th>النوع</th></tr></thead>
    <tbody>${sections}</tbody></table>
    <div class="ft">تصميم وتطوير <b>شركة كفو للبرمجيات</b> · Kaffo.co</div>
    </body></html>`
  // Use a hidden iframe (not window.open) so popup blockers never break the export.
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

function Passengers({ trip }: { trip: any }) {
  // Polls so a student's own attendance change (or the scheduled auto-lock/
  // auto-allocation cron) shows up while the admin has this drawer open.
  const { data } = useTripPassengersQuery(trip.id, { pollingInterval: 60000 })
  if (!data) return null
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        {typeof data.total === 'number'
          ? <span style={{ color: '#64748b' }}>عدد الركاب المؤكدين: <b style={{ color: '#0B2E5E' }}>{data.total}</b></span>
          : <span />}
        <Button size="small" icon={<FilePdfOutlined />} onClick={() => manifestPDF(trip, data)}>تصدير PDF</Button>
      </div>
      {(data.groups || []).length === 0 && <Empty description="لا يوجد ركاب مؤكدون" />}
      {(data.groups || []).map((g: any) => (
        <div key={g.pickup_id ?? g.pickup} style={{ marginBottom: 16 }}>
          <Divider orientation="right" style={{ margin: '8px 0' }}>
            {g.time && <Tag color="orange" style={{ fontWeight: 800 }}>⏰ {g.time}</Tag>}
            <Tag color="cyan">{g.pickup}</Tag> {g.passengers.length} راكب
          </Divider>
          <Table
            size="small" rowKey={(r: any) => `${r.student_name}-${r.seat_number}`} pagination={false} dataSource={g.passengers}
            columns={[
              ...(SHOW_SEAT_NUMBERS ? [{ title: 'مقعد', dataIndex: 'seat_number', width: 70, align: 'center' as const, render: (v: any) => <b>{v}</b> }] : []),
              { title: 'الطالب', dataIndex: 'student_name', render: (v: string, r: any) => (
                <span>{v}{r.rescheduled && <Tag color="gold" style={{ marginInlineStart: 6 }}>مؤجل</Tag>}</span>
              ) },
              { title: 'الجامعة', dataIndex: 'university' },
              { title: 'الهاتف', dataIndex: 'student_phone' },
              { title: 'النوع', dataIndex: 'kind', render: (v) => <Tag>{v}</Tag> },
            ]}
          />
        </div>
      ))}
    </div>
  )
}

export default function TripBoard() {
  const { message, modal } = AntdApp.useApp()
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const ds = date.format('YYYY-MM-DD')
  const { data, isFetching } = useTripBoardQuery({ date: ds }, { pollingInterval: 60000 })
  const [runAllocation, { isLoading }] = useRunAllocationMutation()
  const [deleteEmptyTrip] = useDeleteEmptyTripMutation()
  const [openTrip, setOpenTrip] = useState<any>(null)
  const [seatTrip, setSeatTrip] = useState<any>(null)

  const doRun = async () => {
    try { const r = await runAllocation({ date: ds }).unwrap(); message.success(`تم تخصيص المقاعد لـ ${r.allocated_trips} رحلة`) }
    catch { message.error('خطأ في التخصيص') }
  }

  const removeEmpty = (r: any) => {
    modal.confirm({
      title: `حذف رحلة «${r.route_name} — ${r.slot_name}»؟`,
      content: 'مفيش أي حجوزات مرتبطة بيها — الحذف نهائي ولا يمكن التراجع عنه.',
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => {
        try { await deleteEmptyTrip(r.id).unwrap(); message.success('تم حذف الرحلة') }
        catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحذف') }
      },
    })
  }

  return (
    <Card
      title="رحلات الغد التشغيلية"
      extra={
        <Space wrap>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
          <Button type="primary" icon={<ThunderboltOutlined />} loading={isLoading} onClick={doRun}>
            تشغيل التخصيص (١٠م)
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id" loading={isFetching} dataSource={data?.trips || []} scroll={{ x: 800 }}
        locale={{ emptyText: <Empty description="لا توجد رحلات لهذا اليوم بعد" /> }}
        columns={[
          { title: 'الاتجاه', dataIndex: 'direction_display', render: (v, r: any) => <Tag color={r.direction === 'return' ? 'purple' : 'geekblue'}>{v}</Tag> },
          { title: 'الموعد', dataIndex: 'slot_name', render: (v, r: any) => <Tag color="blue">{v}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'السعة', dataIndex: 'total_seats' },
          { title: 'مؤكد', dataIndex: 'confirmed_count', render: (v, r: any) => (
            <Space size={4}>
              <Tag color="green">{v}</Tag>
              {r.held_count > 0 && <Tag color="gold">+{r.held_count} معلّق</Tag>}
            </Space>
          ) },
          { title: 'انتظار', dataIndex: 'waiting_count', render: (v) => <Tag color="orange">{v}</Tag> },
          {
            title: 'الإشغال', render: (_, r: any) => {
              // occupancy from the server counts BOTH مؤكد and معلّق (held daily
              // bookings awaiting payment approval) against the live capacity, so
              // a seat reserved by a daily student is reflected here too.
              const occ = r.occupancy_percent ?? Math.round(((r.confirmed_count + (r.held_count || 0)) / (r.total_seats || 1)) * 100)
              return (
                <Tooltip title={`مؤكد ${r.confirmed_count}${r.held_count ? ` + معلّق ${r.held_count}` : ''} من ${r.total_seats}`}>
                  <Progress
                    percent={Math.min(occ, 100)} format={() => `${occ}%`} size="small" style={{ width: 120 }}
                    strokeColor={r.is_full ? '#dc2626' : occ >= 80 ? '#ea580c' : '#0e7490'} />
                </Tooltip>
              )
            },
          },
          {
            title: '', render: (_, r: any) => (
              <Space>
                <Button size="small" type="primary" ghost onClick={() => setSeatTrip(r)}>المقاعد</Button>
                <Button size="small" onClick={() => setOpenTrip(r)}>كشف الركاب</Button>
                {r.confirmed_count === 0 && r.held_count === 0 && r.waiting_count === 0 && (
                  <Tooltip title="لا يوجد أي حجز مرتبط بهذه الرحلة">
                    <Button size="small" danger onClick={() => removeEmpty(r)}>حذف</Button>
                  </Tooltip>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={openTrip ? `ركاب: ${openTrip.slot_name} — ${openTrip.route_name}` : ''}
        open={!!openTrip} onClose={() => setOpenTrip(null)} width={560}
      >
        {openTrip && <Passengers trip={openTrip} />}
      </Drawer>

      <Drawer
        title={seatTrip ? `خريطة المقاعد: ${seatTrip.slot_name} — ${seatTrip.route_name}` : ''}
        open={!!seatTrip} onClose={() => setSeatTrip(null)} width={620}
      >
        {seatTrip && <SeatManager trip={seatTrip} />}
      </Drawer>
    </Card>
  )
}

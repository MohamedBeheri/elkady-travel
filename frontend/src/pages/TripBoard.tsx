import { Card, DatePicker, Button, Table, Tag, Drawer, App as AntdApp, Space, Empty, Progress, Divider, Modal, List } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useTripBoardQuery, useRunAllocationMutation, useTripPassengersQuery,
  useSeatmapQuery, useReleaseSeatMutation, useSeatRequestsQuery, useConfirmSeatMutation,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'

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
      title: `فحت المقعد رقم ${n}؟`,
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
                <List.Item.Meta title={`${r.student_name} — مقعد ${r.seat_number}`} description={r.university_name} />
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

function Passengers({ tripId }: { tripId: number }) {
  const { data } = useTripPassengersQuery(tripId)
  if (!data) return null
  return (
    <div>
      {typeof data.total === 'number' && (
        <div style={{ marginBottom: 12, color: '#64748b' }}>عدد الركاب المؤكدين: <b style={{ color: '#0B2E5E' }}>{data.total}</b></div>
      )}
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
              { title: 'مقعد', dataIndex: 'seat_number', width: 70, align: 'center', render: (v) => <b>{v}</b> },
              { title: 'الطالب', dataIndex: 'student_name' },
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
  const { message } = AntdApp.useApp()
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const ds = date.format('YYYY-MM-DD')
  const { data, isFetching } = useTripBoardQuery({ date: ds })
  const [runAllocation, { isLoading }] = useRunAllocationMutation()
  const [openTrip, setOpenTrip] = useState<any>(null)
  const [seatTrip, setSeatTrip] = useState<any>(null)

  const doRun = async () => {
    try { const r = await runAllocation({ date: ds }).unwrap(); message.success(`تم تخصيص المقاعد لـ ${r.allocated_trips} رحلة`) }
    catch { message.error('خطأ في التخصيص') }
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
          { title: 'الموعد', dataIndex: 'slot_name', render: (v, r: any) => <Tag color="blue">{v}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'الوجهة', dataIndex: 'destination_name' },
          { title: 'السعة', dataIndex: 'total_seats' },
          { title: 'مؤكد', dataIndex: 'confirmed_count', render: (v) => <Tag color="green">{v}</Tag> },
          { title: 'انتظار', dataIndex: 'waiting_count', render: (v) => <Tag color="orange">{v}</Tag> },
          {
            title: 'الإشغال', render: (_, r: any) => (
              <Progress percent={Math.round((r.confirmed_count / r.total_seats) * 100)} size="small" style={{ width: 120 }} strokeColor="#0e7490" />
            ),
          },
          {
            title: '', render: (_, r: any) => (
              <Space>
                <Button size="small" type="primary" ghost onClick={() => setSeatTrip(r)}>المقاعد</Button>
                <Button size="small" onClick={() => setOpenTrip(r)}>كشف الركاب</Button>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={openTrip ? `ركاب: ${openTrip.slot_name} — ${openTrip.route_name}` : ''}
        open={!!openTrip} onClose={() => setOpenTrip(null)} width={560}
      >
        {openTrip && <Passengers tripId={openTrip.id} />}
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

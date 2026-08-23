import { Card, DatePicker, Row, Col, Tag, Button, App as AntdApp, Empty, Progress, Select, Alert } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useReturnAvailabilityQuery, useReturnBookingsQuery, useBookReturnMutation, useChangeReturnMutation,
  useRoutesQuery, useUniversitiesQuery,
} from '../app/api'
import { useAppSelector } from '../app/store'

export default function ReturnTrip() {
  const { message } = AntdApp.useApp()
  const user = useAppSelector((s) => s.auth.user)
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const [routeId, setRouteId] = useState<number>()
  const [uniId, setUniId] = useState<number | undefined>(user?.university || undefined)
  const ds = date.format('YYYY-MM-DD')

  const { data: routes } = useRoutesQuery({ active: true })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: avail } = useReturnAvailabilityQuery({ date: ds })
  const { data: myBookings } = useReturnBookingsQuery({ date: ds })
  const [bookReturn, { isLoading }] = useBookReturnMutation()
  const [changeReturn] = useChangeReturnMutation()

  const mine = (myBookings?.results || []).find((b: any) => b.status === 'confirmed')
  const selectedRoute = (routes?.results || []).find((r: any) => r.id === routeId)
  const destUnis = (unis?.results || []).filter((u: any) => !selectedRoute || u.destination === selectedRoute.destination)

  const act = async (slotId: number) => {
    if (!routeId) { message.warning('اختر المسار أولاً (لتحديد اتجاه العودة)'); return }
    try {
      if (mine) {
        await changeReturn({ id: mine.id, return_slot: slotId }).unwrap()
        message.success('تم تغيير موعد العودة')
      } else {
        await bookReturn({ date: ds, return_slot: slotId, university: uniId, route: routeId }).unwrap()
        message.success('تم حجز موعد العودة')
      }
    } catch (e: any) {
      message.error(e?.data?.detail || 'تعذر الحجز')
    }
  }

  return (
    <Card
      title={<span style={{ fontWeight: 800 }}>حجز رحلة العودة</span>}
      extra={<DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />}
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="رحلة العودة تكون عكس اتجاه الذهاب (من الجامعة/الوجهة إلى المحافظة). اختر المسار لتحديد الاتجاه." />
      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={24} md={12}>
          <Select style={{ width: '100%' }} placeholder="المسار (اتجاه العودة عكسه)" value={routeId}
            onChange={(v) => { setRouteId(v); setUniId(undefined) }}
            options={(routes?.results || []).map((r: any) => ({ value: r.id, label: `العودة: ${r.destination_name} ← ${r.origin_label}` }))} />
        </Col>
        <Col xs={24} md={12}>
          <Select style={{ width: '100%' }} placeholder="الجامعة" value={uniId} onChange={setUniId}
            options={destUnis.map((u: any) => ({ value: u.id, label: u.name }))} />
        </Col>
      </Row>

      {mine && <Tag color="green" style={{ marginBottom: 16 }}>حجزك الحالي: {mine.slot_name} {mine.direction ? `(${mine.direction})` : ''}</Tag>}
      <Row gutter={[16, 16]}>
        {(avail?.slots || []).length === 0 && <Col span={24}><Empty description="لا توجد مواعيد" /></Col>}
        {(avail?.slots || []).map((s: any) => {
          const pct = Math.round((s.used / s.capacity) * 100)
          const isMine = mine?.return_slot === s.id
          return (
            <Col xs={24} sm={12} md={8} key={s.id}>
              <div className="pickup-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 16 }}>{s.name}</b>
                  {s.full ? <Tag color="red">مكتمل</Tag> : <Tag color="green">{s.available} متاح</Tag>}
                </div>
                <Progress percent={pct} showInfo={false} strokeColor={s.full ? '#ef4444' : '#0e7490'} style={{ margin: '10px 0' }} />
                <div style={{ color: '#64748b', fontSize: 13, marginBottom: 10 }}>{s.used} / {s.capacity} مقعد</div>
                <Button
                  type={isMine ? 'default' : 'primary'} block disabled={s.full || isMine} loading={isLoading}
                  onClick={() => act(s.id)}
                >
                  {isMine ? 'محجوز حالياً' : mine ? 'تغيير لهذا الموعد' : 'احجز العودة'}
                </Button>
              </div>
            </Col>
          )
        })}
      </Row>
    </Card>
  )
}

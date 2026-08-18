import { Card, DatePicker, Row, Col, Tag, Button, App as AntdApp, Empty, Progress } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useReturnAvailabilityQuery, useReturnBookingsQuery, useBookReturnMutation, useChangeReturnMutation,
} from '../app/api'
import { useAppSelector } from '../app/store'

export default function ReturnTrip() {
  const { message } = AntdApp.useApp()
  const user = useAppSelector((s) => s.auth.user)
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const ds = date.format('YYYY-MM-DD')

  const { data: avail } = useReturnAvailabilityQuery({ date: ds })
  const { data: myBookings } = useReturnBookingsQuery({ date: ds })
  const [bookReturn, { isLoading }] = useBookReturnMutation()
  const [changeReturn] = useChangeReturnMutation()

  const mine = (myBookings?.results || []).find((b: any) => b.status === 'confirmed')

  const act = async (slotId: number) => {
    try {
      if (mine) {
        await changeReturn({ id: mine.id, return_slot: slotId }).unwrap()
        message.success('تم تغيير موعد العودة')
      } else {
        await bookReturn({ date: ds, return_slot: slotId, university: user?.university }).unwrap()
        message.success('تم حجز موعد العودة')
      }
    } catch (e: any) {
      message.error(e?.data?.detail || 'تعذر الحجز')
    }
  }

  return (
    <Card
      title="حجز رحلة العودة"
      extra={<DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />}
    >
      {mine && <Tag color="green" style={{ marginBottom: 16 }}>حجزك الحالي: {mine.slot_name}</Tag>}
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
                  {isMine ? 'محجوز حالياً' : mine ? 'تغيير لهذا الموعد' : 'احجز'}
                </Button>
              </div>
            </Col>
          )
        })}
      </Row>
    </Card>
  )
}

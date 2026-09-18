import { Card, DatePicker, Row, Col, Tag, Button, Empty, Alert, App as AntdApp, Spin, Select } from 'antd'
import { CarOutlined, RollbackOutlined, CheckCircleFilled, CloseCircleFilled, ClockCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useAttendanceQuery, useSetAttendanceMutation } from '../app/api'
import { SHOW_SEAT_NUMBERS } from '../app/uiFlags'

export default function Attendance() {
  const { message } = AntdApp.useApp()
  const [date, setDate] = useState<any>(dayjs().add(1, 'day'))
  const dateStr = date.format('YYYY-MM-DD')
  const { data, isFetching } = useAttendanceQuery({ date: dateStr })
  const [setAttendance, { isLoading }] = useSetAttendanceMutation()

  const seats = data?.seats || []
  const locked = !!data?.locked

  const confirm = async (lock_id: number, slot_id: number) => {
    try {
      await setAttendance({ lock_id, date: dateStr, attending: true, slot_id }).unwrap()
      message.success('تم تأكيد حضورك للرحلة المختارة')
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر تحديث الحالة') }
  }
  const decline = async (lock_id: number) => {
    try {
      await setAttendance({ lock_id, date: dateStr, attending: false }).unwrap()
      message.success('تم إخلاء مقعدك لهذا اليوم')
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر تحديث الحالة') }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16, background: 'linear-gradient(120deg,#0B2E5E,#123a73 60%,#EC6A16)', border: 'none' }}>
        <div style={{ color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>تأكيد رحلة الغد</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>
            اختر الميعاد اللي ترغب في الركوب فيه بكرا (ذهاب وعودة)، وتذكرتك تتحدَّث تلقائياً بموعد التقاطك.
            لو مش هتحضر يوم، أخلِ مقعدك يستفيد منه غيرك — ويبقى محجوزاً لك في باقي الأيام.
          </div>
        </div>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 700, marginInlineEnd: 10 }}>اختر اليوم:</span>
        <DatePicker value={date} onChange={(d) => d && setDate(d)}
          disabledDate={(d) => d && d < dayjs().startOf('day')} allowClear={false} />
      </Card>

      {locked && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="تأكيدات هذا اليوم مُقفلة الآن"
          description={`الوقت انتهى (بعد الساعة ${data?.lock_time}) — تم حسم من يحضر بكرة تلقائياً، ولا يمكن تعديل قرارك بعد الآن.`} />
      )}

      {isFetching ? <Spin /> : seats.length === 0 ? (
        <Empty description="لا يوجد لديك اشتراك ترم/شهري بمقعد ثابت. احجز اشتراكاً أولاً." />
      ) : (
        <Row gutter={[16, 16]}>
          {seats.map((s: any) => <SeatCard key={s.lock_id} s={s} isLoading={isLoading} locked={locked} confirm={confirm} decline={decline} />)}
        </Row>
      )}

      <Alert type="info" showIcon style={{ marginTop: 16 }}
        message="مقعدك يبقى محجوزاً لك طوال مدة الاشتراك ما لم تعتذر عن يوم بعينه، أو تُلغِ الإدارة الحجز." />
    </div>
  )
}

function SeatCard({ s, isLoading, locked, confirm, decline }: any) {
  // Local editable slot before hitting Confirm — defaults to the current pick.
  const [pending, setPending] = useState<number>(s.chosen_slot_id)
  const chosen = s.available_slots.find((x: any) => x.id === pending) || s.available_slots.find((x: any) => x.id === s.chosen_slot_id)
  const differsFromDefault = chosen && chosen.id !== s.default_slot_id
  return (
    <Col xs={24} md={12}>
      <Card style={{ borderInlineStart: `5px solid ${s.attending ? '#16a34a' : '#ef4444'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {s.direction === 'return' ? <RollbackOutlined style={{ fontSize: 20, color: '#EC6A16' }} /> : <CarOutlined style={{ fontSize: 20, color: '#0B2E5E' }} />}
          <b style={{ fontSize: 16 }}>{s.direction_display}</b>
          {s.attending
            ? <Tag icon={<CheckCircleFilled />} color="green">محجوز — سأحضر</Tag>
            : <Tag icon={<CloseCircleFilled />} color="red">مُخلى لهذا اليوم</Tag>}
        </div>
        <div style={{ color: '#475569', marginBottom: 4 }}>الخط: {s.route}</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <span>نقطتك: <b>{s.pickup_name || '—'}</b></span>
          {SHOW_SEAT_NUMBERS && <span>المقعد: <b style={{ color: '#0B2E5E' }}>{s.seat_number}</b></span>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ marginBottom: 6, color: '#475569' }}>الميعاد لهذا اليوم:</div>
          <Select style={{ width: '100%' }} value={pending} onChange={setPending} disabled={locked}
            options={(s.available_slots || []).map((o: any) => ({
              value: o.id,
              label: `${o.name}${o.time ? ` — ⏰ ${o.time}` : ''}${o.is_default ? ' (افتراضي)' : ''}`,
            }))} />
          {chosen?.time && s.attending && (
            <Tag icon={<ClockCircleOutlined />} color="blue" style={{ marginTop: 8 }}>
              موعد {s.direction === 'return' ? 'نزولك' : 'التقاطك'}: {chosen.time}
            </Tag>
          )}
          {differsFromDefault && <Tag color="orange" style={{ marginTop: 8 }}>ميعاد مختلف عن الافتراضي</Tag>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button type="primary" loading={isLoading} disabled={locked} onClick={() => confirm(s.lock_id, pending)}>
            {s.attending && pending === s.chosen_slot_id ? 'تحديث الاختيار' : 'سأحضر على هذا الميعاد'}
          </Button>
          {s.attending && <Button danger loading={isLoading} disabled={locked} onClick={() => decline(s.lock_id)}>لن أحضر هذا اليوم</Button>}
        </div>
      </Card>
    </Col>
  )
}

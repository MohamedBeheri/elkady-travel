import { Card, DatePicker, Row, Col, Tag, Button, Empty, Alert, App as AntdApp, Spin } from 'antd'
import { CarOutlined, RollbackOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useAttendanceQuery, useSetAttendanceMutation } from '../app/api'

export default function Attendance() {
  const { message } = AntdApp.useApp()
  const [date, setDate] = useState<any>(dayjs().add(1, 'day'))
  const dateStr = date.format('YYYY-MM-DD')
  const { data, isFetching } = useAttendanceQuery({ date: dateStr })
  const [setAttendance, { isLoading }] = useSetAttendanceMutation()

  const seats = data?.seats || []

  const toggle = async (lock_id: number, attending: boolean) => {
    try {
      await setAttendance({ lock_id, date: dateStr, attending }).unwrap()
      message.success(attending ? 'تم تأكيد حضورك لهذه الرحلة' : 'تم إخلاء مقعدك لهذا اليوم')
    } catch { message.error('تعذر تحديث الحالة') }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16, background: 'linear-gradient(120deg,#0B2E5E,#123a73 60%,#EC6A16)', border: 'none' }}>
        <div style={{ color: '#fff' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>تأكيد رحلة الغد</div>
          <div style={{ opacity: 0.9, marginTop: 4 }}>مقعدك الثابت محجوز لك كل يوم. لو لن تحضر يوماً، أخلِ مقعدك ليستفيد به غيرك — ويبقى محجوزاً لك في باقي الأيام.</div>
        </div>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 700, marginInlineEnd: 10 }}>اختر اليوم:</span>
        <DatePicker value={date} onChange={(d) => d && setDate(d)}
          disabledDate={(d) => d && d < dayjs().startOf('day')} allowClear={false} />
      </Card>

      {isFetching ? <Spin /> : seats.length === 0 ? (
        <Empty description="لا يوجد لديك اشتراك ترم/شهري بمقعد ثابت. احجز اشتراكاً أولاً." />
      ) : (
        <Row gutter={[16, 16]}>
          {seats.map((s: any) => (
            <Col xs={24} md={12} key={s.lock_id}>
              <Card style={{ borderInlineStart: `5px solid ${s.attending ? '#16a34a' : '#ef4444'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {s.direction === 'return' ? <RollbackOutlined style={{ fontSize: 20, color: '#EC6A16' }} /> : <CarOutlined style={{ fontSize: 20, color: '#0B2E5E' }} />}
                  <b style={{ fontSize: 16 }}>{s.direction_display}</b>
                  {s.attending
                    ? <Tag icon={<CheckCircleFilled />} color="green">محجوز — سأحضر</Tag>
                    : <Tag icon={<CloseCircleFilled />} color="red">مُخلى لهذا اليوم</Tag>}
                </div>
                <div style={{ color: '#475569', marginBottom: 4 }}>الخط: {s.route}</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                  <span>الموعد: <b>{s.slot}</b></span>
                  <span>المقعد: <b style={{ color: '#0B2E5E' }}>{s.seat_number}</b></span>
                </div>
                {s.attending ? (
                  <Button danger loading={isLoading} onClick={() => toggle(s.lock_id, false)}>لن أحضر هذا اليوم</Button>
                ) : (
                  <Button type="primary" loading={isLoading} onClick={() => toggle(s.lock_id, true)}>سأحضر — احجز مقعدي</Button>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Alert type="info" showIcon style={{ marginTop: 16 }}
        message="مقعدك يبقى محجوزاً لك طوال مدة الاشتراك ما لم تعتذر عن يوم بعينه، أو تُلغِ الإدارة الحجز." />
    </div>
  )
}

import { Card, Form, Select, DatePicker, App as AntdApp, Alert, Spin, Button, Result } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  useRoutesQuery, useMorningSlotsQuery, useUniversitiesQuery,
  useSeatmapForQuery, useBookSpecificSeatMutation,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'
import { useAppSelector } from '../app/store'

export default function DailyBooking() {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const gender = useAppSelector((s) => s.auth.user?.gender)
  const [routeId, setRouteId] = useState<number>()
  const [query, setQuery] = useState<{ date: string; route: number; morning_slot: number } | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [done, setDone] = useState<{ kind: string; seat: number; message: string } | null>(null)

  const { data: routes } = useRoutesQuery({ active: true })
  const { data: slots } = useMorningSlotsQuery()
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: seatmap, isFetching } = useSeatmapForQuery(query!, { skip: !query })
  const [bookSeat, { isLoading }] = useBookSpecificSeatMutation()

  const selectedRoute = routes?.results?.find((r: any) => r.id === routeId)
  const destUnis = (unis?.results || []).filter((u: any) => !selectedRoute || u.destination === selectedRoute.destination)

  const loadMap = (values: any) => {
    setSelected(null); setDone(null)
    setQuery({ date: values.date.format('YYYY-MM-DD'), route: values.route, morning_slot: values.morning_slot })
  }

  const confirm = async () => {
    if (!selected) { message.warning('اختر مقعداً من الخريطة'); return }
    const v = form.getFieldsValue()
    try {
      const res = await bookSeat({
        date: v.date.format('YYYY-MM-DD'), route: v.route, morning_slot: v.morning_slot,
        seat_number: selected, university: v.university,
      }).unwrap()
      setDone({ kind: res.kind, seat: res.seat_number, message: res.message })
      setSelected(null)
    } catch (e: any) {
      message.error(e?.data?.detail || 'تعذر الحجز')
    }
  }

  if (done) {
    return (
      <Card>
        <Result
          status="success"
          title={`تم حجز المقعد رقم ${done.seat}`}
          subTitle={done.message}
          extra={[
            <Button type="primary" key="t" onClick={() => navigate('/tickets')}>عرض تذكرتي و QR</Button>,
            <Button key="b" onClick={() => setDone(null)}>حجز آخر</Button>,
          ]}
        />
      </Card>
    )
  }

  return (
    <div>
      <Card title="حجز رحلة يومية — اختيار المقعد" style={{ marginBottom: 20 }}>
        <Alert type="info" style={{ marginBottom: 16 }}
          message="اختر التاريخ والمسار والموعد لعرض خريطة المقاعد، ثم اضغط على المقعد المتاح. مقاعد الترم مقفولة 🔒. طلاب اليومي: يُحجز المقعد مؤقتاً حتى تأكيد الدفع." />
        <Form form={form} layout="inline" onFinish={loadMap} initialValues={{ date: dayjs().add(1, 'day') }} style={{ rowGap: 12 }}>
          <Form.Item name="date" label="التاريخ" rules={[{ required: true }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="route" label="المسار" rules={[{ required: true }]}>
            <Select style={{ width: 220 }} placeholder="المسار"
              onChange={(v) => { setRouteId(v); form.setFieldsValue({ university: undefined }) }}
              options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="morning_slot" label="الموعد" rules={[{ required: true }]}>
            <Select style={{ width: 130 }} placeholder="الموعد"
              options={(slots?.results || slots || []).map((s: any) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
            <Select style={{ width: 200 }} placeholder="الجامعة"
              options={destUnis.map((u: any) => ({ value: u.id, label: u.name }))} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">عرض المقاعد</Button>
          </Form.Item>
        </Form>
      </Card>

      {query && (
        <Card title={`خريطة المقاعد ${seatmap?.trip ? `— ${seatmap.trip.route_name} (${seatmap.trip.slot_name})` : ''}`}>
          {isFetching ? <Spin /> : seatmap && (
            <div style={{ textAlign: 'center' }}>
              <SeatMap layout={seatmap.layout} seats={seatmap.seats} selected={selected} onSelect={setSelected} viewerGender={gender} />
              <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
              <div style={{ marginTop: 18 }}>
                <Button type="primary" size="large" disabled={!selected} loading={isLoading} onClick={confirm}>
                  {selected ? `تأكيد حجز المقعد رقم ${selected}` : 'اختر مقعداً'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

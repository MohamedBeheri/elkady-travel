import {
  Card, Segmented, Form, Select, DatePicker, Button, App as AntdApp, Alert, Spin, Result,
  Statistic, Input, Upload, Descriptions, Radio, Row, Col, Tag, Progress,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  useRoutesQuery, useMorningSlotsQuery, useUniversitiesQuery, usePickupPointsQuery, usePricesQuery,
  useSeatmapForQuery, useBookSpecificSeatMutation,
  useCreateSubscriptionMutation, usePaymentMethodsQuery, usePaymentAccountsQuery, useSubmitPaymentMutation,
  useReturnAvailabilityQuery, useBookReturnMutation,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'
import { useAppSelector } from '../app/store'

const SUB_TYPES = [
  { value: 'term', label: 'اشتراك ترم' },
  { value: 'monthly', label: 'اشتراك شهري' },
]

/* ================= Daily seat booking + return prompt ================= */
function DailyBooking({ routes, slots, unis, preRoute }: any) {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const gender = useAppSelector((s) => s.auth.user?.gender)
  const [routeId, setRouteId] = useState<number | undefined>(preRoute)
  const [query, setQuery] = useState<any>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [step, setStep] = useState<'seat' | 'return' | 'done'>('seat')
  const [bookedInfo, setBookedInfo] = useState<any>(null)

  const { data: seatmap, isFetching } = useSeatmapForQuery(query, { skip: !query })
  const [bookSeat, { isLoading }] = useBookSpecificSeatMutation()
  const [bookReturn, { isLoading: rLoading }] = useBookReturnMutation()
  const dateStr = () => form.getFieldValue('date')?.format('YYYY-MM-DD')
  const { data: retAvail } = useReturnAvailabilityQuery(step === 'return' ? { date: dateStr() } : undefined, { skip: step !== 'return' })

  const selectedRoute = routes.find((r: any) => r.id === routeId)
  const destUnis = unis.filter((u: any) => !selectedRoute || u.destination === selectedRoute.destination)

  const loadMap = (v: any) => { setSelected(null); setStep('seat'); setBookedInfo(null); setQuery({ date: v.date.format('YYYY-MM-DD'), route: v.route, morning_slot: v.morning_slot }) }

  const confirm = async () => {
    if (!selected) { message.warning('اختر مقعداً'); return }
    const v = form.getFieldsValue()
    try {
      const res = await bookSeat({ date: v.date.format('YYYY-MM-DD'), route: v.route, morning_slot: v.morning_slot, seat_number: selected, university: v.university }).unwrap()
      setBookedInfo({ ...res, seat: selected }); setStep('return')
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر الحجز') }
  }

  const doReturn = async (slotId: number) => {
    const v = form.getFieldsValue()
    try {
      await bookReturn({ date: v.date.format('YYYY-MM-DD'), return_slot: slotId, university: v.university }).unwrap()
      message.success('تم حجز رحلة العودة'); setStep('done')
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر حجز العودة') }
  }

  if (step === 'done' || (step === 'return' && bookedInfo === null)) {
    return <Result status="success" title={`تم حجز مقعدك رقم ${bookedInfo?.seat}`} subTitle="يمكنك متابعة تذكرتك ورمز QR من صفحة تذاكري."
      extra={[<Button type="primary" key="t" onClick={() => navigate('/tickets')}>عرض تذكرتي</Button>, <Button key="n" onClick={() => { setStep('seat'); setQuery(null); setBookedInfo(null) }}>حجز آخر</Button>]} />
  }

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="اختر التاريخ والمسار والموعد لعرض خريطة المقاعد، ثم اختر مقعدك. أصحاب الترم/الشهري لهم الأولوية." />
      <Form form={form} layout="inline" onFinish={loadMap} initialValues={{ date: dayjs().add(1, 'day'), route: preRoute }} style={{ rowGap: 12, marginBottom: 8 }}>
        <Form.Item name="date" label="التاريخ" rules={[{ required: true }]}><DatePicker /></Form.Item>
        <Form.Item name="route" label="المسار" rules={[{ required: true }]}>
          <Select style={{ width: 220 }} placeholder="المسار" onChange={(v) => { setRouteId(v); form.setFieldsValue({ university: undefined }) }}
            options={routes.map((r: any) => ({ value: r.id, label: r.name }))} />
        </Form.Item>
        <Form.Item name="morning_slot" label="الموعد" rules={[{ required: true }]}>
          <Select style={{ width: 130 }} placeholder="الموعد" options={slots.map((s: any) => ({ value: s.id, label: s.name }))} />
        </Form.Item>
        <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
          <Select style={{ width: 200 }} placeholder="الجامعة" options={destUnis.map((u: any) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
        <Form.Item><Button type="primary" htmlType="submit">عرض المقاعد</Button></Form.Item>
      </Form>

      {query && step === 'seat' && (isFetching ? <Spin /> : seatmap && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <SeatMap layout={seatmap.layout} seats={seatmap.seats} selected={selected} onSelect={setSelected} viewerGender={gender} />
          <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
          <Button type="primary" size="large" disabled={!selected} loading={isLoading} onClick={confirm} style={{ marginTop: 18 }}>
            {selected ? `تأكيد حجز المقعد رقم ${selected}` : 'اختر مقعداً'}
          </Button>
        </div>
      ))}

      {step === 'return' && bookedInfo && (
        <Card style={{ marginTop: 16, maxWidth: 720, marginInline: 'auto' }}>
          <Result status="success" style={{ paddingBottom: 8 }}
            title={`تم حجز مقعد الذهاب رقم ${bookedInfo.seat}`}
            subTitle="هل تريد حجز رحلة العودة أيضاً في نفس اليوم؟" />
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <Button onClick={() => setStep('done')} style={{ marginInlineEnd: 10 }}>لا، شكراً</Button>
            <span style={{ color: '#64748b' }}>أو اختر موعد العودة بالأسفل ↓</span>
          </div>
          <Row gutter={[12, 12]}>
            {(retAvail?.slots || []).map((s: any) => {
              const pct = Math.round((s.used / s.capacity) * 100)
              return (
                <Col xs={12} md={8} key={s.id}>
                  <div className="pickup-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <b>{s.name}</b>{s.full ? <Tag color="red">مكتمل</Tag> : <Tag color="green">{s.available} متاح</Tag>}
                    </div>
                    <Progress percent={pct} showInfo={false} strokeColor={s.full ? '#ef4444' : '#0e7490'} style={{ margin: '8px 0' }} />
                    <Button type="primary" block disabled={s.full} loading={rLoading} onClick={() => doReturn(s.id)}>احجز العودة</Button>
                  </div>
                </Col>
              )
            })}
          </Row>
        </Card>
      )}
    </div>
  )
}

/* ================= Subscription (term / monthly) + inline payment ================= */
function SubscriptionBooking({ routes, unis, preRoute }: any) {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [subType, setSubType] = useState('term')
  const [routeId, setRouteId] = useState<number | undefined>(preRoute)
  const [created, setCreated] = useState<any>(null)   // created subscription → payment step
  const [methodId, setMethodId] = useState<number>()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<any>(null)

  const { data: prices } = usePricesQuery({ active: true })
  const { data: pickups } = usePickupPointsQuery(routeId ? { route: routeId, active: true } : undefined, { skip: !routeId })
  const { data: methods } = usePaymentMethodsQuery()
  const { data: accounts } = usePaymentAccountsQuery()
  const [createSub, { isLoading }] = useCreateSubscriptionMutation()
  const [submitPayment, { isLoading: paying }] = useSubmitPaymentMutation()

  const price = prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === subType)?.price
  const selectedRoute = routes.find((r: any) => r.id === routeId)
  const destUnis = unis.filter((u: any) => !selectedRoute || u.destination === selectedRoute.destination)
  const account = (accounts?.results || accounts || []).find((a: any) => a.method === methodId)

  const create = async (v: any) => {
    if (!price) { message.error('لا يوجد سعر متاح لهذا الاختيار'); return }
    try {
      const sub = await createSub({ subscription_type: subType, route: v.route, university: v.university, pickup_point: v.pickup_point, amount: price }).unwrap()
      setCreated(sub)
    } catch { message.error('تعذر إنشاء الاشتراك') }
  }

  const pay = async () => {
    if (!methodId) { message.error('اختر وسيلة الدفع'); return }
    if (!file) { message.error('ارفع صورة إثبات الدفع'); return }
    const fd = new FormData(); fd.append('payment_method', String(methodId)); fd.append('payment_reference', reference); fd.append('payment_proof', file)
    try { await submitPayment({ id: created.id, body: fd }).unwrap(); setCreated({ ...created, _paid: true }) } catch { message.error('تعذر الإرسال') }
  }

  if (created?._paid) {
    return <Result status="success" title="تم إرسال إثبات الدفع للمراجعة"
      subTitle="سيتم تأكيد اشتراكك بعد مراجعة الإدارة. أصحاب الترم يختارون مقعدهم الثابت بعد التأكيد."
      extra={[<Button type="primary" key="m" onClick={() => navigate('/my-bookings')}>حجوزاتي والدفع</Button>]} />
  }

  if (created) {
    return (
      <Card title={`دفع الاشتراك — ${SUB_TYPES.find((t) => t.value === subType)?.label}`} style={{ maxWidth: 520 }}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="حوّل المبلغ إلى الحساب الظاهر ثم ارفع صورة الإيصال. لا يُعتمد الدفع إلا بعد مراجعة الإدارة." />
        <Statistic title="المبلغ المطلوب" value={Number(created.amount)} suffix="ج.م" style={{ marginBottom: 14 }} />
        <div style={{ marginBottom: 8 }}>وسيلة الدفع:</div>
        <Select style={{ width: '100%', marginBottom: 12 }} placeholder="اختر وسيلة الدفع" value={methodId} onChange={setMethodId}
          options={(methods?.results || methods || []).map((m: any) => ({ value: m.id, label: m.name }))} />
        {account && (
          <Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="اسم الحساب">{account.holder_name}</Descriptions.Item>
            <Descriptions.Item label="الرقم">{account.number}</Descriptions.Item>
            {account.instructions && <Descriptions.Item label="تعليمات">{account.instructions}</Descriptions.Item>}
          </Descriptions>
        )}
        <Input placeholder="مرجع التحويل (اختياري)" value={reference} onChange={(e) => setReference(e.target.value)} style={{ marginBottom: 12 }} />
        <Upload beforeUpload={(f) => { setFile(f); return false }} maxCount={1} fileList={file ? [file] : []} onRemove={() => setFile(null)} accept="image/*,application/pdf">
          <Button icon={<UploadOutlined />}>رفع صورة الإيصال</Button>
        </Upload>
        <div style={{ marginTop: 16 }}>
          <Button type="primary" loading={paying} onClick={pay}>إرسال إثبات الدفع</Button>
          <Button style={{ marginInlineStart: 8 }} onClick={() => setCreated(null)}>رجوع</Button>
        </div>
      </Card>
    )
  }

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="اختر نوع الاشتراك والمسار، ثم أكمل الدفع. بعد تأكيد الإدارة: مشترك الترم يختار مقعده الثابت، والشهري يحجز مقعده اليومي بأولوية." />
      <Radio.Group value={subType} onChange={(e) => setSubType(e.target.value)} optionType="button" buttonStyle="solid" style={{ marginBottom: 16 }}>
        {SUB_TYPES.map((t) => <Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>)}
      </Radio.Group>
      <Form form={form} layout="vertical" onFinish={create} initialValues={{ route: preRoute }} style={{ maxWidth: 520 }}>
        <Form.Item name="route" label="المسار" rules={[{ required: true }]}>
          <Select placeholder="اختر المسار" onChange={(v) => { setRouteId(v); form.setFieldsValue({ university: undefined, pickup_point: undefined }) }}
            options={routes.map((r: any) => ({ value: r.id, label: r.name }))} />
        </Form.Item>
        <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
          <Select placeholder="اختر الجامعة" options={destUnis.map((u: any) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
        <Form.Item name="pickup_point" label="نقطة الالتقاط">
          <Select placeholder="اختر نقطة الالتقاط" allowClear options={(pickups?.results || []).map((p: any) => ({ value: p.id, label: `${p.sequence}. ${p.name}` }))} />
        </Form.Item>
        {price !== undefined && <Statistic title="المبلغ المطلوب" value={Number(price)} suffix="ج.م" style={{ marginBottom: 16 }} />}
        <Button type="primary" htmlType="submit" loading={isLoading}>متابعة الدفع</Button>
      </Form>
    </div>
  )
}

/* ================= Unified booking page ================= */
export default function Book() {
  const [params] = useSearchParams()
  const preRoute = params.get('route') ? Number(params.get('route')) : undefined
  const [mode, setMode] = useState<'daily' | 'sub'>(params.get('mode') === 'sub' ? 'sub' : 'daily')

  const { data: routesQ } = useRoutesQuery({ active: true })
  const { data: slotsQ } = useMorningSlotsQuery()
  const { data: unisQ } = useUniversitiesQuery({ active: true })
  const routes = routesQ?.results || []
  const slots = slotsQ?.results || slotsQ || []
  const unis = unisQ?.results || []

  return (
    <Card title={<span style={{ fontWeight: 800 }}>احجز رحلتك</span>}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <Segmented size="large" value={mode} onChange={(v) => setMode(v as any)}
          options={[{ value: 'daily', label: '🚌 رحلة يومية (اختيار مقعد)' }, { value: 'sub', label: '🎫 اشتراك (ترم / شهري)' }]} />
      </div>
      {mode === 'daily'
        ? <DailyBooking routes={routes} slots={slots} unis={unis} preRoute={preRoute} />
        : <SubscriptionBooking routes={routes} unis={unis} preRoute={preRoute} />}
    </Card>
  )
}

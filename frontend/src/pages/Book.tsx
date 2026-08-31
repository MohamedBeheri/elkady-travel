import {
  Card, Tabs, Form, Select, DatePicker, Button, App as AntdApp, Alert, Spin, Result,
  Statistic, Input, Upload, Descriptions, Radio, Divider, Tag,
} from 'antd'
import {
  UploadOutlined, CarOutlined, RollbackOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  useMorningSlotsQuery, useReturnSlotsQuery, useUniversitiesQuery,
  usePublicPickupPointsQuery, usePricesQuery,
  useSeatmapForQuery, useBookSpecificSeatMutation,
  useCreateSubscriptionMutation, usePaymentMethodsQuery, usePaymentAccountsQuery, useSubmitPaymentMutation,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'
import TourismRequest from './TourismRequest'
import { useAppSelector } from '../app/store'

const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' },
  { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' },
  { value: 'benha', label: 'بنها' },
]
const SUB_TYPES = [
  { value: 'term', label: 'اشتراك ترم' },
  { value: 'monthly', label: 'اشتراك شهري' },
]

/* ================= Daily booking: university → trip type → center → pickup → slot(s) → seat(s) ================= */
function DailyFlow({ unis }: any) {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const user = useAppSelector((s) => s.auth.user)
  const gender = user?.gender

  // Pre-fill from the student's saved profile (§2). They can still change any field.
  const [university, setUniversity] = useState<number | undefined>(user?.university ?? undefined)
  const [tripType, setTripType] = useState<'go' | 'return' | 'round'>('go')
  const [center, setCenter] = useState<string | undefined>(user?.center || undefined)
  const [pickupId, setPickupId] = useState<number | undefined>(user?.pickup_point || undefined)
  const [date, setDate] = useState<any>(dayjs().add(1, 'day'))
  const [goSlot, setGoSlot] = useState<number>()
  const [goSeat, setGoSeat] = useState<number | null>(null)
  const [retSlot, setRetSlot] = useState<number>()
  const [retSeat, setRetSeat] = useState<number | null>(null)
  const [done, setDone] = useState<any>(null)

  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const { data: mSlots } = useMorningSlotsQuery()
  const { data: rSlots } = useReturnSlotsQuery()
  const { data: prices } = usePricesQuery({ active: true })
  const [bookSeat, { isLoading }] = useBookSpecificSeatMutation()

  const selUni = unis.find((u: any) => u.id === university)
  const availPickups = (pickups || []).filter((p: any) => !selUni || p.destination === selUni.destination)
  const selPickup = availPickups.find((p: any) => p.id === pickupId)
  const routeId: number | undefined = selPickup?.route_id
  const seatSelection = selPickup ? selPickup.seat_selection !== false : true

  const wantGo = tripType === 'go' || tripType === 'round'
  const wantRet = tripType === 'return' || tripType === 'round'
  const dateStr = date ? date.format('YYYY-MM-DD') : undefined

  // Direction-aware wording: on the return leg the student's center point is the
  // DROP-OFF, and the trip runs from the university back to their center.
  const uniName = selUni?.name || ''
  const destName = selPickup?.destination_name || ''
  const pointName = selPickup?.name || ''
  const pointFieldLabel = tripType === 'return' ? 'نقطة النزول' : tripType === 'round' ? 'نقطة الالتقاط / النزول' : 'نقطة الالتقاط'
  const step2Title = tripType === 'return' ? '٢) المركز ونقطة النزول والتاريخ' : '٢) المركز ونقطة الالتقاط والتاريخ'

  const goQuery = wantGo && routeId && goSlot && dateStr ? { date: dateStr, route: routeId, direction: 'go', morning_slot: goSlot } : undefined
  const retQuery = wantRet && routeId && retSlot && dateStr ? { date: dateStr, route: routeId, direction: 'return', return_slot: retSlot } : undefined
  const { data: goMap, isFetching: goFetch } = useSeatmapForQuery(goQuery as any, { skip: !goQuery })
  const { data: retMap, isFetching: retFetch } = useSeatmapForQuery(retQuery as any, { skip: !retQuery })

  // Reset chosen seats whenever the trip that owns them changes.
  useEffect(() => { setGoSeat(null) }, [routeId, goSlot, dateStr])
  useEffect(() => { setRetSeat(null) }, [routeId, retSlot, dateStr])

  const dailyPrice = Number(prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === 'daily')?.price || 0)
  const legs = tripType === 'round' ? 2 : 1
  const total = dailyPrice * legs

  const canConfirm = !!(university && center && pickupId && dateStr && routeId
    && (!wantGo || (goSlot && (goSeat || !seatSelection)))
    && (!wantRet || (retSlot && (retSeat || !seatSelection))))

  const confirm = async () => {
    try {
      let g = goSeat, r = retSeat
      if (wantGo) {
        const res = await bookSeat({ date: dateStr, route: routeId, direction: 'go', morning_slot: goSlot, seat_number: seatSelection ? goSeat : undefined, university, pickup_point: pickupId }).unwrap()
        g = res?.seat_number ?? goSeat
      }
      if (wantRet) {
        const res = await bookSeat({ date: dateStr, route: routeId, direction: 'return', return_slot: retSlot, seat_number: seatSelection ? retSeat : undefined, university, pickup_point: pickupId }).unwrap()
        r = res?.seat_number ?? retSeat
      }
      setDone({ total, goSeat: g, retSeat: r })
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر إتمام الحجز') }
  }

  const reset = () => {
    setDone(null); setGoSeat(null); setRetSeat(null); setGoSlot(undefined); setRetSlot(undefined)
  }

  if (done) {
    return (
      <Result status="success"
        title="تم تسجيل حجزك بنجاح"
        subTitle={`${wantGo ? `مقعد الذهاب رقم ${done.goSeat}` : ''}${wantGo && wantRet ? ' · ' : ''}${wantRet ? `مقعد العودة رقم ${done.retSeat}` : ''} — بانتظار تأكيد الدفع من الإدارة. تابع تذكرتك ورمز QR بعد التأكيد.`}
        extra={[
          <Button type="primary" key="t" onClick={() => navigate('/tickets')}>عرض تذاكري</Button>,
          <Button key="b" onClick={() => navigate('/my-bookings')}>الدفع ومتابعة الحجز</Button>,
          <Button key="n" type="dashed" onClick={reset}>حجز آخر</Button>,
        ]} />
    )
  }

  const noPickups = center && selUni && availPickups.length === 0

  return (
    <div>
      {/* Step 1 — University + trip type */}
      <Card size="small" style={{ marginBottom: 14 }} title={<span><b>١) الجامعة ونوع الرحلة</b></span>}>
        <Form layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <Form.Item label="الجامعة" required style={{ marginBottom: 8 }}>
              <Select placeholder="اختر الجامعة" value={university}
                onChange={(v) => { setUniversity(v); setPickupId(undefined) }}
                options={unis.map((u: any) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
            <Form.Item label="نوع الرحلة" required style={{ marginBottom: 8 }}>
              <Radio.Group value={tripType} onChange={(e) => setTripType(e.target.value)} optionType="button" buttonStyle="solid">
                <Radio.Button value="go">ذهاب فقط</Radio.Button>
                <Radio.Button value="return">عودة فقط</Radio.Button>
                <Radio.Button value="round">ذهاب وعودة</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* Step 2 — Center + pickup/drop-off + date */}
      <Card size="small" style={{ marginBottom: 14 }} title={<span><b>{step2Title}</b></span>}>
        <Form layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Form.Item label="المركز" required style={{ marginBottom: 8 }}>
              <Select placeholder="اختر المركز" value={center}
                onChange={(v) => { setCenter(v); setPickupId(undefined) }} options={CENTERS} />
            </Form.Item>
            <Form.Item label={pointFieldLabel} required style={{ marginBottom: 8 }}>
              <Select placeholder={center ? `اختر ${pointFieldLabel}` : 'اختر المركز أولاً'} disabled={!center}
                value={pickupId} onChange={setPickupId} showSearch optionFilterProp="label"
                options={availPickups.map((p: any) => ({ value: p.id, label: p.name }))} />
            </Form.Item>
            <Form.Item label="تاريخ الرحلة" required style={{ marginBottom: 8 }}>
              <DatePicker style={{ width: '100%' }} value={date} onChange={setDate}
                disabledDate={(d) => d && d < dayjs().startOf('day')} />
            </Form.Item>
          </div>
          {noPickups && <Alert type="warning" showIcon message="لا توجد نقاط لهذا المركز تخدم الجامعة المختارة. جرّب مركزاً آخر." />}
          {selPickup && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {wantGo && <Tag icon={<CarOutlined />} color="blue">الذهاب: من {pointName} إلى {uniName}</Tag>}
              {wantRet && <Tag icon={<RollbackOutlined />} color="gold">العودة: من {uniName || destName} إلى {pointName} (نقطة النزول)</Tag>}
            </div>
          )}
        </Form>
      </Card>

      {/* Step 3 — Going leg */}
      {wantGo && (
        <Card size="small" style={{ marginBottom: 14 }}
          title={<span><CarOutlined /> <b>٣) الذهاب — من مركزك إلى الجامعة</b></span>}>
          <Form layout="vertical">
            <Form.Item label="موعد الذهاب" required style={{ maxWidth: 260 }}>
              <Select placeholder="اختر الموعد" value={goSlot} onChange={setGoSlot} disabled={!routeId}
                options={(mSlots?.results || mSlots || []).map((s: any) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Form>
          {!seatSelection
            ? goSlot && <Alert type="success" showIcon message="سيتم تخصيص مقعدك تلقائياً لهذه الرحلة (اختيار المقاعد غير مفعّل لهذا الخط)." />
            : goQuery && (goFetch ? <Spin /> : goMap && (
              <div style={{ textAlign: 'center' }}>
                <SeatMap layout={goMap.layout} seats={goMap.seats} selected={goSeat} onSelect={setGoSeat} viewerGender={gender} />
                <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
                {goSeat && <Tag color="green" style={{ marginTop: 8 }}>مقعد الذهاب المختار: {goSeat}</Tag>}
              </div>
            ))}
        </Card>
      )}

      {/* Step 4 — Return leg */}
      {wantRet && (
        <Card size="small" style={{ marginBottom: 14 }}
          title={<span><RollbackOutlined /> <b>{wantGo ? '٤' : '٣'}) العودة — من الجامعة إلى مركزك</b></span>}>
          {selPickup && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`رحلة العودة من ${uniName || destName} إلى ${pointName} (نقطة النزول) — عكس اتجاه الذهاب.`} />
          )}
          <Form layout="vertical">
            <Form.Item label="موعد العودة" required style={{ maxWidth: 260 }}>
              <Select placeholder="اختر موعد العودة" value={retSlot} onChange={setRetSlot} disabled={!routeId}
                options={(rSlots?.results || rSlots || []).map((s: any) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Form>
          {!seatSelection
            ? retSlot && <Alert type="success" showIcon message="سيتم تخصيص مقعد العودة تلقائياً (اختيار المقاعد غير مفعّل لهذا الخط)." />
            : retQuery && (retFetch ? <Spin /> : retMap && (
              <div style={{ textAlign: 'center' }}>
                <SeatMap layout={retMap.layout} seats={retMap.seats} selected={retSeat} onSelect={setRetSeat} viewerGender={gender} />
                <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
                {retSeat && <Tag color="green" style={{ marginTop: 8 }}>مقعد العودة المختار: {retSeat}</Tag>}
              </div>
            ))}
        </Card>
      )}

      {/* Step 5 — Invoice + confirm */}
      <Card size="small" style={{ background: '#f8fafc' }} title={<span><b>{wantGo && wantRet ? '٥' : '٤'}) إجمالي الفاتورة</b></span>}>
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
          {wantGo && <Descriptions.Item label="رحلة الذهاب">{dailyPrice.toLocaleString()} ج.م {goSeat ? `· مقعد ${goSeat}` : ''}</Descriptions.Item>}
          {wantRet && <Descriptions.Item label="رحلة العودة">{dailyPrice.toLocaleString()} ج.م {retSeat ? `· مقعد ${retSeat}` : ''}</Descriptions.Item>}
        </Descriptions>
        <Statistic title="الإجمالي المطلوب" value={total} suffix="ج.م" valueStyle={{ color: '#0B2E5E', fontWeight: 800 }} />
        <Divider style={{ margin: '14px 0' }} />
        <Button type="primary" size="large" disabled={!canConfirm} loading={isLoading} onClick={confirm}>
          تأكيد الحجز {total ? `(${total.toLocaleString()} ج.م)` : ''}
        </Button>
        <div style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>
          يُحجز المقعد مؤقتاً ثم يُعتمد بعد رفع إثبات الدفع ومراجعة الإدارة من صفحة «حجوزاتي والدفع».
        </div>
      </Card>
    </div>
  )
}

/* ================= Subscription (term / monthly) + inline payment ================= */
function SubscriptionBooking({ unis }: any) {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const user = useAppSelector((s) => s.auth.user)
  const [subType, setSubType] = useState('term')
  const [university, setUniversity] = useState<number | undefined>(user?.university ?? undefined)
  const [center, setCenter] = useState<string | undefined>(user?.center || undefined)
  const [pickupId, setPickupId] = useState<number | undefined>(user?.pickup_point || undefined)
  const [created, setCreated] = useState<any>(null)
  const [methodId, setMethodId] = useState<number>()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<any>(null)

  const { data: prices } = usePricesQuery({ active: true })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const { data: methods } = usePaymentMethodsQuery()
  const { data: accounts } = usePaymentAccountsQuery()
  const [createSub, { isLoading }] = useCreateSubscriptionMutation()
  const [submitPayment, { isLoading: paying }] = useSubmitPaymentMutation()

  const selUni = unis.find((u: any) => u.id === university)
  const availPickups = (pickups || []).filter((p: any) => !selUni || p.destination === selUni.destination)
  const selPickup = availPickups.find((p: any) => p.id === pickupId)
  const routeId: number | undefined = selPickup?.route_id
  const price = prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === subType)?.price
  const account = (accounts?.results || accounts || []).find((a: any) => a.method === methodId)
  const canCreate = !!(university && center && pickupId && routeId && price !== undefined)

  const create = async () => {
    if (!price) { message.error('لا يوجد سعر متاح لهذا الاختيار'); return }
    try {
      const sub = await createSub({ subscription_type: subType, route: routeId, university, pickup_point: pickupId, amount: price }).unwrap()
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
      subTitle="بعد تأكيد الإدارة للدفع سيُخصَّص لك مقعد ثابت للذهاب وآخر للعودة طوال المدة، ويظهر لك «تذكرة الاشتراك». تؤكد حضورك (أو تعتذر) لرحلة الغد يومياً من صفحة «رحلة الغد»."
      extra={[
        <Button type="primary" key="t" onClick={() => navigate('/tickets')}>تذكرتي</Button>,
        <Button key="m" onClick={() => navigate('/my-bookings')}>حجوزاتي والدفع</Button>,
      ]} />
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

  const noPickups = center && selUni && availPickups.length === 0

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="اختر نوع الاشتراك والجامعة والمركز ونقطة الالتقاط، ثم أكمل الدفع. بعد تأكيد الإدارة يُخصَّص لك مقعد ثابت للذهاب وآخر للعودة طوال المدة، وتؤكد حضورك لرحلة الغد يومياً." />
      <Radio.Group value={subType} onChange={(e) => setSubType(e.target.value)} optionType="button" buttonStyle="solid" style={{ marginBottom: 16 }}>
        {SUB_TYPES.map((t) => <Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>)}
      </Radio.Group>
      <Form layout="vertical" style={{ maxWidth: 560 }}>
        <Form.Item label="الجامعة" required>
          <Select placeholder="اختر الجامعة" value={university}
            onChange={(v) => { setUniversity(v); setPickupId(undefined) }}
            options={unis.map((u: any) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item label="المركز" required>
            <Select placeholder="اختر المركز" value={center}
              onChange={(v) => { setCenter(v); setPickupId(undefined) }} options={CENTERS} />
          </Form.Item>
          <Form.Item label="نقطة الالتقاط" required>
            <Select placeholder={center ? 'اختر نقطة الالتقاط' : 'اختر المركز أولاً'} disabled={!center}
              value={pickupId} onChange={setPickupId} showSearch optionFilterProp="label"
              options={availPickups.map((p: any) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
        </div>
        {noPickups && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="لا توجد نقاط لهذا المركز تخدم الجامعة المختارة. جرّب مركزاً آخر." />}
        {selPickup && <Tag color="blue" style={{ marginBottom: 12 }}>الخط: {selPickup.route}</Tag>}
        {price !== undefined
          ? <Statistic title="المبلغ المطلوب" value={Number(price)} suffix="ج.م" style={{ marginBottom: 16 }} />
          : (routeId && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="لا يوجد سعر مُسجَّل لهذا الاشتراك على هذا الخط." />)}
        <Button type="primary" onClick={create} loading={isLoading} disabled={!canCreate}>متابعة الدفع</Button>
      </Form>
    </div>
  )
}

/* ================= Unified booking home ================= */
export default function Book() {
  const [tab, setTab] = useState('daily')
  const { data: unisQ } = useUniversitiesQuery({ active: true })
  const unis = unisQ?.results || []

  return (
    <Card title={<span style={{ fontWeight: 800, fontSize: 18 }}>احجز رحلتك</span>}>
      <Tabs activeKey={tab} onChange={setTab} size="large"
        items={[
          { key: 'daily', label: '🚌 حجز يومي', children: <DailyFlow unis={unis} /> },
          { key: 'sub', label: '🎫 حجز ترم / شهري', children: <SubscriptionBooking unis={unis} /> },
          { key: 'tourism', label: '🏖️ رحلات سياحية', children: <TourismRequest /> },
        ]} />
    </Card>
  )
}

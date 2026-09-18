import {
  Card, Tabs, Form, Select, DatePicker, Button, App as AntdApp, Alert, Spin, Result,
  Statistic, Input, Upload, Descriptions, Radio, Divider, Tag,
} from 'antd'
import {
  UploadOutlined, CarOutlined, RollbackOutlined,
} from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  useMorningSlotsQuery, useReturnSlotsQuery, useUniversitiesQuery,
  usePublicPickupPointsQuery, usePricesQuery, useCapacitiesQuery,
  useSeatmapForQuery, useBookDailyMutation,
  useCreateSubscriptionMutation, usePaymentMethodsQuery, usePaymentAccountsQuery, useSubmitPaymentMutation,
  useCompanyQuery,
} from '../app/api'
import SeatMap, { SeatLegend } from '../components/SeatMap'
import TourismRequest from './TourismRequest'
import { useAppSelector } from '../app/store'
import { SHOW_SEAT_NUMBERS } from '../app/uiFlags'
import { dedupePickups } from '../app/validators'

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

/* ================= Shared payment panel (upload receipt → admin review) ================= */
function PaymentPanel({ sub, title, onBack, onPaid }: any) {
  const { message } = AntdApp.useApp()
  const { data: methods } = usePaymentMethodsQuery()
  const { data: accounts } = usePaymentAccountsQuery()
  const [submitPayment, { isLoading: paying }] = useSubmitPaymentMutation()
  const [methodId, setMethodId] = useState<number>()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<any>(null)

  const accountList = (accounts?.results || accounts || []).filter((a: any) => a.active !== false)
  const activeMethodIds = new Set(accountList.map((a: any) => a.method))
  const availableMethods = (methods?.results || methods || []).filter((m: any) => activeMethodIds.has(m.id))
  const account = accountList.find((a: any) => a.method === methodId)
  useEffect(() => { if (!methodId && availableMethods.length === 1) setMethodId(availableMethods[0].id) }, [availableMethods.length, methodId])

  const pay = async () => {
    if (!methodId) { message.error('اختر وسيلة الدفع'); return }
    if (!file) { message.error('ارفع صورة إثبات الدفع'); return }
    const fd = new FormData(); fd.append('payment_method', String(methodId)); fd.append('payment_reference', reference); fd.append('payment_proof', file)
    try { await submitPayment({ id: sub.id, body: fd }).unwrap(); onPaid() } catch { message.error('تعذر الإرسال') }
  }

  return (
    <Card title={title} style={{ maxWidth: 520 }}>
      <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="حوّل المبلغ إلى الحساب الظاهر ثم ارفع صورة الإيصال. لا يُعتمد الحجز إلا بعد مراجعة الإدارة." />
      <Statistic title="المبلغ المطلوب" value={Number(sub.amount)} suffix="ج.م" style={{ marginBottom: 14 }} />
      <div style={{ marginBottom: 8 }}>وسيلة الدفع:</div>
      {availableMethods.length === 0
        ? <Alert type="error" showIcon style={{ marginBottom: 12 }} message="لم تُهيَّأ حسابات استلام بعد. تواصل مع الإدارة." />
        : <Select style={{ width: '100%', marginBottom: 12 }} placeholder="اختر وسيلة الدفع" value={methodId} onChange={setMethodId}
            options={availableMethods.map((m: any) => ({ value: m.id, label: m.name }))} />}
      {account && (
        <>
          <Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="اسم الحساب">{account.holder_name}</Descriptions.Item>
            <Descriptions.Item label="الرقم">
              <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>{account.number}</span>{' '}
              <Button size="small" onClick={() => { navigator.clipboard?.writeText(account.number); message.success('تم النسخ') }}>نسخ</Button>
            </Descriptions.Item>
            {account.transfer_link && (
              <Descriptions.Item label="لينك التحويل"><a href={account.transfer_link} target="_blank" rel="noreferrer">افتح رابط التحويل</a></Descriptions.Item>
            )}
            {account.instructions && <Descriptions.Item label="تعليمات">{account.instructions}</Descriptions.Item>}
          </Descriptions>
          {account.qr_image && (
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>امسح الكود بتطبيق الدفع</div>
              <img src={account.qr_image} alt="qr" style={{ maxWidth: 220, width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </div>
          )}
        </>
      )}
      <Input placeholder="مرجع التحويل (اختياري)" value={reference} onChange={(e) => setReference(e.target.value)} style={{ marginBottom: 12 }} />
      <Upload beforeUpload={(f) => { setFile(f); return false }} maxCount={1} fileList={file ? [file] : []} onRemove={() => setFile(null)} accept="image/*,application/pdf">
        <Button icon={<UploadOutlined />}>رفع صورة الإيصال</Button>
      </Upload>
      <div style={{ marginTop: 16 }}>
        <Button type="primary" loading={paying} onClick={pay}>إرسال إثبات الدفع</Button>
        {onBack && <Button style={{ marginInlineStart: 8 }} onClick={onBack}>رجوع</Button>}
      </div>
    </Card>
  )
}

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
  const [params] = useSearchParams()
  const qDate = params.get('date')
  const [date, setDate] = useState<any>(qDate ? dayjs(qDate) : dayjs().add(1, 'day'))
  const [goSlot, setGoSlot] = useState<number>()
  const [goSeat, setGoSeat] = useState<number | null>(null)
  const [retSlot, setRetSlot] = useState<number>()
  const [retSeat, setRetSeat] = useState<number | null>(null)
  const [created, setCreated] = useState<any>(null)
  const [paid, setPaid] = useState(false)

  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const { data: mSlots } = useMorningSlotsQuery()
  const { data: rSlots } = useReturnSlotsQuery()
  const { data: prices } = usePricesQuery({ active: true })
  const { data: caps } = useCapacitiesQuery()
  const [bookDaily, { isLoading }] = useBookDailyMutation()

  const selUni = unis.find((u: any) => u.id === university)
  const availPickups = dedupePickups((pickups || []).filter((p: any) => !selUni || p.destination === selUni.destination))
  const selPickup = availPickups.find((p: any) => p.id === pickupId)
  const routeId: number | undefined = selPickup?.route_id
  const seatSelection = selPickup ? selPickup.seat_selection !== false : true
  // Only offer morning slots actually configured (سعة المقاعد) for this route —
  // never the full global slot list, so booking can't create a phantom trip
  // at a route/slot combo the admin never set up.
  const goSlotIds = new Set((caps?.results || caps || [])
    .filter((c: any) => c.route === routeId).map((c: any) => c.morning_slot))
  const availGoSlots = (mSlots?.results || mSlots || []).filter((s: any) => !routeId || goSlotIds.has(s.id))

  // Re-align the saved pickup ID to the row for the CURRENT university's
  // destination — the saved ID may live on the other-destination copy.
  useEffect(() => {
    if (!availPickups.length) return
    if (pickupId && availPickups.some((p: any) => p.id === pickupId)) return
    const savedName = (user?.pickup_name || '').trim()
    if (!savedName) return
    const match = availPickups.find((p: any) => (p.name || '').trim() === savedName)
    if (match) setPickupId(match.id)
  }, [availPickups, pickupId, user?.pickup_name])

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

  const priceFor = (t: string) => {
    const row = prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === t)
    return row ? Number(row.price) : undefined
  }
  const legacyDaily = priceFor('daily') ?? 0
  const goPrice = priceFor('daily_go') ?? legacyDaily
  const returnPrice = priceFor('daily_return') ?? legacyDaily
  const roundPrice = priceFor('daily_round') ?? (goPrice + returnPrice)
  const total = tripType === 'round' ? roundPrice : tripType === 'return' ? returnPrice : goPrice

  const canConfirm = !!(university && center && pickupId && dateStr && routeId
    && (!wantGo || (goSlot && (goSeat || !seatSelection)))
    && (!wantRet || (retSlot && (retSeat || !seatSelection))))

  const confirm = async () => {
    try {
      const res = await bookDaily({
        date: dateStr, route: routeId, university, pickup_point: pickupId,
        trip_type: tripType,
        morning_slot: wantGo ? goSlot : undefined,
        return_slot: wantRet ? retSlot : undefined,
        go_seat: wantGo && seatSelection ? goSeat : undefined,
        ret_seat: wantRet && seatSelection ? retSeat : undefined,
      }).unwrap()
      setCreated(res.subscription)
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر إتمام الحجز') }
  }

  const reset = () => {
    setCreated(null); setPaid(false); setGoSeat(null); setRetSeat(null); setGoSlot(undefined); setRetSlot(undefined)
  }

  if (paid) {
    return (
      <Result status="success"
        title="تم إرسال إثبات الدفع للمراجعة"
        subTitle="حُجز مقعدك مؤقتاً. بعد تأكيد الإدارة للدفع تظهر لك التذكرة ورمز QR. تابع الحالة من «حجوزاتي والدفع»."
        extra={[
          <Button type="primary" key="t" onClick={() => navigate('/tickets')}>عرض تذاكري</Button>,
          <Button key="b" onClick={() => navigate('/my-bookings')}>حجوزاتي والدفع</Button>,
          <Button key="n" type="dashed" onClick={reset}>حجز آخر</Button>,
        ]} />
    )
  }

  if (created) {
    return <PaymentPanel sub={created} title="دفع الحجز اليومي — رفع الإيصال"
      onBack={() => setCreated(null)} onPaid={() => setPaid(true)} />
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
                value={pickupId} onChange={(v) => { setPickupId(v); setGoSlot(undefined) }} showSearch optionFilterProp="label"
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
                options={availGoSlots.map((s: any) => ({
                  value: s.id,
                  label: selPickup?.go_times?.[s.id] ? `${s.name} — التقاطك ${selPickup.go_times[s.id]}` : s.name,
                }))} />
            </Form.Item>
          </Form>
          {goSlot && selPickup?.go_times?.[goSlot] && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`⏰ موعد التقاطك من ${pointName}: ${selPickup.go_times[goSlot]}`} />
          )}
          {!seatSelection
            ? goSlot && <Alert type="success" showIcon message="سيتم تخصيص مقعدك تلقائياً لهذه الرحلة (اختيار المقاعد غير مفعّل لهذا الخط)." />
            : goQuery && (goFetch ? <Spin /> : goMap && (
              <div style={{ textAlign: 'center' }}>
                <SeatMap layout={goMap.layout} seats={goMap.seats} selected={goSeat} onSelect={setGoSeat} viewerGender={gender} />
                <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
                {goSeat && <Tag color="green" style={{ marginTop: 8 }}>{SHOW_SEAT_NUMBERS ? `مقعد الذهاب المختار: ${goSeat}` : 'تم اختيار مقعد الذهاب'}</Tag>}
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
                options={(rSlots?.results || rSlots || []).map((s: any) => ({
                  value: s.id,
                  label: selPickup?.return_times?.[s.id] ? `${s.name} — نزولك ${selPickup.return_times[s.id]}` : s.name,
                }))} />
            </Form.Item>
          </Form>
          {retSlot && selPickup?.return_times?.[retSlot] && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }}
              message={`⏰ موعد نزولك في ${pointName}: ${selPickup.return_times[retSlot]}`} />
          )}
          {!seatSelection
            ? retSlot && <Alert type="success" showIcon message="سيتم تخصيص مقعد العودة تلقائياً (اختيار المقاعد غير مفعّل لهذا الخط)." />
            : retQuery && (retFetch ? <Spin /> : retMap && (
              <div style={{ textAlign: 'center' }}>
                <SeatMap layout={retMap.layout} seats={retMap.seats} selected={retSeat} onSelect={setRetSeat} viewerGender={gender} />
                <div style={{ display: 'flex', justifyContent: 'center' }}><SeatLegend /></div>
                {retSeat && <Tag color="green" style={{ marginTop: 8 }}>{SHOW_SEAT_NUMBERS ? `مقعد العودة المختار: ${retSeat}` : 'تم اختيار مقعد العودة'}</Tag>}
              </div>
            ))}
        </Card>
      )}

      {/* Step 5 — Invoice + confirm */}
      <Card size="small" style={{ background: '#f8fafc' }} title={<span><b>{wantGo && wantRet ? '٥' : '٤'}) إجمالي الفاتورة</b></span>}>
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
          {tripType === 'round'
            ? <Descriptions.Item label="ذهاب وعودة (سعر مجمّع)">
                {roundPrice.toLocaleString()} ج.م
                {SHOW_SEAT_NUMBERS && goSeat ? ` · مقعد ذهاب ${goSeat}` : ''}
                {SHOW_SEAT_NUMBERS && retSeat ? ` · مقعد عودة ${retSeat}` : ''}
              </Descriptions.Item>
            : <>
                {wantGo && <Descriptions.Item label="رحلة الذهاب">{goPrice.toLocaleString()} ج.م {SHOW_SEAT_NUMBERS && goSeat ? `· مقعد ${goSeat}` : ''}</Descriptions.Item>}
                {wantRet && <Descriptions.Item label="رحلة العودة">{returnPrice.toLocaleString()} ج.م {SHOW_SEAT_NUMBERS && retSeat ? `· مقعد ${retSeat}` : ''}</Descriptions.Item>}
              </>}
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
function SubscriptionBooking({ unis, termOpen = true, monthlyOpen = true }: any) {
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const user = useAppSelector((s) => s.auth.user)
  const availableSubTypes = SUB_TYPES.filter((t) => (t.value === 'term' ? termOpen : monthlyOpen))
  const [subType, setSubType] = useState(availableSubTypes[0]?.value || 'term')
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
  const availPickups = dedupePickups((pickups || []).filter((p: any) => !selUni || p.destination === selUni.destination))
  const selPickup = availPickups.find((p: any) => p.id === pickupId)
  const routeId: number | undefined = selPickup?.route_id
  const price = prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === subType)?.price

  useEffect(() => {
    if (!availPickups.length) return
    if (pickupId && availPickups.some((p: any) => p.id === pickupId)) return
    const savedName = (user?.pickup_name || '').trim()
    if (!savedName) return
    const match = availPickups.find((p: any) => (p.name || '').trim() === savedName)
    if (match) setPickupId(match.id)
  }, [availPickups, pickupId, user?.pickup_name])
  // Only expose methods the admin actually configured an active account for.
  const accountList = (accounts?.results || accounts || []).filter((a: any) => a.active !== false)
  const activeMethodIds = new Set(accountList.map((a: any) => a.method))
  const availableMethods = (methods?.results || methods || []).filter((m: any) => activeMethodIds.has(m.id))
  const account = accountList.find((a: any) => a.method === methodId)
  const canCreate = !!(university && center && pickupId && routeId && price !== undefined)

  // Auto-select the single available method to skip a pointless dropdown.
  useEffect(() => {
    if (!methodId && availableMethods.length === 1) setMethodId(availableMethods[0].id)
  }, [availableMethods.length, methodId])

  const create = async () => {
    if (!price) { message.error('لا يوجد سعر متاح لهذا الاختيار'); return }
    try {
      const sub = await createSub({
        subscription_type: subType, route: routeId, university, pickup_point: pickupId, amount: price,
      }).unwrap()
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
        {availableMethods.length === 0
          ? <Alert type="error" showIcon style={{ marginBottom: 12 }} message="لم تُهيَّأ حسابات استلام بعد. تواصل مع الإدارة." />
          : <Select style={{ width: '100%', marginBottom: 12 }} placeholder="اختر وسيلة الدفع" value={methodId} onChange={setMethodId}
              options={availableMethods.map((m: any) => ({ value: m.id, label: m.name }))} />}
        {account && (
          <>
            <Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="اسم الحساب">{account.holder_name}</Descriptions.Item>
              <Descriptions.Item label="الرقم">
                <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>{account.number}</span>
                {' '}
                <Button size="small" onClick={() => { navigator.clipboard?.writeText(account.number); message.success('تم النسخ') }}>نسخ</Button>
              </Descriptions.Item>
              {account.transfer_link && (
                <Descriptions.Item label="لينك التحويل">
                  <a href={account.transfer_link} target="_blank" rel="noreferrer">افتح رابط التحويل</a>
                </Descriptions.Item>
              )}
              {account.instructions && <Descriptions.Item label="تعليمات">{account.instructions}</Descriptions.Item>}
            </Descriptions>
            {account.qr_image && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>امسح الكود بتطبيق الدفع</div>
                <img src={account.qr_image} alt="qr"
                  style={{ maxWidth: 220, width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              </div>
            )}
          </>
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
        message="اختر نوع الاشتراك والجامعة ونقطة الالتقاط وميعادَي الذهاب والعودة اليوميَّين، ثم أكمل الدفع. بعد تأكيد الإدارة يُخصَّص لك مقعد ثابت في المواعيد التي اخترتها ويظهر وقت التقاطك على التذكرة." />
      <Radio.Group value={subType} onChange={(e) => setSubType(e.target.value)} optionType="button" buttonStyle="solid" style={{ marginBottom: 16 }}>
        {availableSubTypes.map((t) => <Radio.Button key={t.value} value={t.value}>{t.label}</Radio.Button>)}
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
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="ميعاد الذهاب والعودة تختاره يومياً من صفحة «رحلة الغد» بعد تأكيد الإدارة، وتذكرتك تتحدَّث بموعد التقاطك تلقائياً." />
        {price !== undefined
          ? <Statistic title="المبلغ المطلوب" value={Number(price)} suffix="ج.م" style={{ marginBottom: 16 }} />
          : (routeId && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="لا يوجد سعر مُسجَّل لهذا الاشتراك على هذا الخط." />)}
        <Button type="primary" onClick={create} loading={isLoading} disabled={!canCreate}>متابعة الدفع</Button>
      </Form>
    </div>
  )
}

/* ================= Unified booking home ================= */
const Closed = ({ what, description }: { what: string; description?: string }) => (
  <Alert type="warning" showIcon message={`${what} مغلق حالياً`}
    description={description || 'سيُفتح فور رفع القفل من إدارة المنصة. حاول لاحقاً أو تواصل مع الإدارة.'} />
)

export default function Book() {
  const [tab, setTab] = useState('daily')
  const { data: unisQ } = useUniversitiesQuery({ active: true })
  const { data: company } = useCompanyQuery()
  const unis = unisQ?.results || []
  const cutoff = company?.daily_booking_cutoff_time
  const pastCutoff = !!cutoff && dayjs().format('HH:mm:ss') >= cutoff
  const dailyOpen = company?.booking_daily_open !== false && !pastCutoff
  const termOpen = company?.booking_term_open !== false
  const monthlyOpen = company?.booking_monthly_open !== false
  const subOpen = termOpen || monthlyOpen

  return (
    <Card title={<span style={{ fontWeight: 800, fontSize: 18 }}>احجز رحلتك</span>}>
      <Tabs activeKey={tab} onChange={setTab} size="large"
        items={[
          { key: 'daily', label: '🚌 حجز يومي', children: dailyOpen ? <DailyFlow unis={unis} /> : (
            <Closed what="الحجز اليومي" description={pastCutoff
              ? `الحجز اليومي مغلق تلقائياً بعد الساعة ${dayjs(cutoff, 'HH:mm:ss').format('HH:mm')} — يُفتح تلقائياً بعد منتصف الليل.`
              : undefined} />
          ) },
          { key: 'sub', label: '🎫 حجز ترم / شهري', children: subOpen ? <SubscriptionBooking unis={unis} termOpen={termOpen} monthlyOpen={monthlyOpen} /> : <Closed what="حجز الترم والشهري" /> },
          { key: 'tourism', label: '🏖️ رحلات سياحية', children: <TourismRequest /> },
        ]} />
    </Card>
  )
}

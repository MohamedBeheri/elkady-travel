import {
  Button, Card, Col, Row, Tag, Segmented, Empty, Select, DatePicker, Radio,
  Form, Input, InputNumber, App as AntdApp, Alert, Result, Divider,
} from 'antd'
import {
  EnvironmentOutlined, ClockCircleOutlined, RollbackOutlined, CarOutlined,
  LoginOutlined, UserAddOutlined, CompassOutlined, SearchOutlined, CalendarOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  useExploreQuery, usePublicTourismRequestMutation,
  usePublicPickupPointsQuery,
} from '../app/api'
import { useAppSelector } from '../app/store'
import { phoneRule } from '../app/validators'

const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }
const TYPE_COLOR: Record<string, string> = { term: 'green', monthly: 'orange', daily: 'gold' }
const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' }, { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' }, { value: 'benha', label: 'بنها' },
]

// A route's own pickup points (e.g. الباجور, منوف on الباجور ← بدر) sit on
// its GO corridor — when the route's return leg actually ends somewhere else
// (e.g. terminating at شبين instead of doubling back), none of that route's
// own points are valid return drop-offs. See Book.tsx for the fuller note.
function isAsymmetricRoutePoint(p: any) {
  return !!(p?.return_destination_name && p.return_destination_name !== p?.destination_name)
}

/* ---------- advanced search: trip type → center → university → point → matching trip ---------- */
function AvailabilityChecker({ data, bookTo }: { data: any; bookTo: string }) {
  const [tripType, setTripType] = useState<'go' | 'return'>('go')
  const [center, setCenter] = useState<string>()
  const [university, setUniversity] = useState<number>()
  const [pickupId, setPickupId] = useState<number>()
  const [date, setDate] = useState<any>(dayjs().add(1, 'day'))
  const [searched, setSearched] = useState(false)
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()

  const unis = data?.universities || []
  const selUni = unis.find((u: any) => u.id === university)
  // explore data exposes destination as a NAME; the pickup endpoint as destination_name.
  const availPickups = (pickups || []).filter((p: any) =>
    (!selUni || p.destination_name === selUni.destination) && (tripType !== 'return' || !isAsymmetricRoutePoint(p)))
  const selPickup = availPickups.find((p: any) => p.id === pickupId)
  const routeId: number | undefined = selPickup?.route_id
  const route = (data?.routes || []).find((r: any) => r.id === routeId)

  const isReturn = tripType === 'return'
  const pointLabel = isReturn ? 'نقطة النزول' : 'نقطة الالتقاط'
  const times = (isReturn ? (data?.return_slots || []) : (data?.morning_slots || []))
  const noPickups = center && selUni && availPickups.length === 0
  const centerLabel = CENTERS.find((c) => c.value === center)?.label || ''

  const run = () => {
    if (!center || !university || !pickupId) { message.warning('أكمل بيانات البحث'); return }
    setSearched(true)
  }
  const reset = (fn: () => void) => { fn(); setSearched(false) }

  return (
    <Card style={{ marginBottom: 20, borderTop: '4px solid #0B2E5E' }}
      title={<span style={{ fontWeight: 800 }}><SearchOutlined style={{ color: '#F07E1B' }} /> بحث متقدم عن رحلتك</span>}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontWeight: 700, marginInlineEnd: 10 }}>نوع الرحلة:</span>
        <Radio.Group value={tripType} optionType="button" buttonStyle="solid"
          onChange={(e) => reset(() => setTripType(e.target.value))}>
          <Radio.Button value="go">ذهاب</Radio.Button>
          <Radio.Button value="return">عودة</Radio.Button>
        </Radio.Group>
        <span style={{ marginInlineStart: 12, color: '#64748b', fontSize: 13 }}>
          {isReturn
            ? 'العودة من الجامعة (بدر/الشروق) إلى مركزك — اختر المركز والجامعة ونقطة النزول.'
            : 'الذهاب من مركزك إلى الجامعة — اختر المركز والجامعة ونقطة الالتقاط.'}
        </span>
      </div>
      <Row gutter={[12, 12]}>
        {(isReturn
          ? [
            <Col key="uni" xs={24} sm={12} md={7}>
              <Select style={{ width: '100%' }} placeholder="الجامعة (العودة منها)" value={university}
                onChange={(v) => reset(() => { setUniversity(v); setPickupId(undefined) })}
                options={unis.map((u: any) => ({ value: u.id, label: u.name }))} />
            </Col>,
            <Col key="center" xs={24} sm={12} md={6}>
              <Select style={{ width: '100%' }} placeholder="المركز (الوصول إليه)" value={center}
                onChange={(v) => reset(() => { setCenter(v); setPickupId(undefined) })} options={CENTERS} />
            </Col>,
          ]
          : [
            <Col key="center" xs={24} sm={12} md={6}>
              <Select style={{ width: '100%' }} placeholder="المركز" value={center}
                onChange={(v) => reset(() => { setCenter(v); setPickupId(undefined) })} options={CENTERS} />
            </Col>,
            <Col key="uni" xs={24} sm={12} md={7}>
              <Select style={{ width: '100%' }} placeholder="الجامعة" value={university}
                onChange={(v) => reset(() => { setUniversity(v); setPickupId(undefined) })}
                options={unis.map((u: any) => ({ value: u.id, label: u.name }))} />
            </Col>,
          ])}
        <Col xs={24} sm={12} md={7}>
          <Select style={{ width: '100%' }} placeholder={center ? pointLabel : 'اختر المركز أولاً'} disabled={!center}
            value={pickupId} onChange={(v) => reset(() => setPickupId(v))} showSearch optionFilterProp="label"
            options={availPickups.map((p: any) => ({ value: p.id, label: p.name }))} />
        </Col>
        <Col xs={24} sm={12} md={10}>
          <DatePicker style={{ width: '100%' }} value={date} onChange={(d) => reset(() => setDate(d || dayjs().add(1, 'day')))}
            allowClear={false} format="YYYY-MM-DD" placeholder="تاريخ السفر" suffixIcon={<CalendarOutlined />}
            disabledDate={(d) => d && d < dayjs().startOf('day')} inputReadOnly />
        </Col>
        <Col xs={24}>
          <Button type="primary" block size="large" icon={<SearchOutlined />} onClick={run}
            style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 800, height: 46 }}>
            أعرض الرحلات المتاحة
          </Button>
        </Col>
      </Row>
      {noPickups && <Alert style={{ marginTop: 12 }} type="warning" showIcon message="لا توجد نقاط لهذا المركز تخدم الجامعة المختارة. جرّب مركزاً آخر." />}

      {searched && (route ? (
        <div style={{ marginTop: 16 }}>
          <Divider style={{ margin: '4px 0 16px' }}>الرحلة المتاحة</Divider>
          <Card styles={{ body: { padding: 18 } }} style={{ borderTop: '4px solid #16a34a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ecfdf5', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {isReturn ? <RollbackOutlined /> : <CarOutlined />}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0B2E5E' }}>{route.name}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>
                  {isReturn
                    ? `العودة من ${route.destination} — الوصول إلى ${centerLabel}، نقطة النزول: ${selPickup?.name}`
                    : `الذهاب من ${selPickup?.name} (${centerLabel}) إلى ${selUni?.name}`}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['term', 'monthly', 'daily'].filter((k) => route.prices[k] != null).map((k) => (
                <div key={k} style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '6px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
                  <Tag color={TYPE_COLOR[k]} style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[k]}</Tag>
                  <div style={{ fontWeight: 800, color: '#0B2E5E', marginTop: 4 }}>{Number(route.prices[k]).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>ج.م</span></div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Tag icon={<CalendarOutlined />} color="blue">تاريخ السفر: {date?.format('YYYY-MM-DD')}</Tag>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
              <ClockCircleOutlined style={{ color: '#F07E1B' }} /> {isReturn ? 'مواعيد العودة' : 'مواعيد الذهاب'}:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {times.length ? times.map((s: any) => (
                <Tag key={s.time} bordered style={{ borderRadius: 20 }}>{s.time}{isReturn && s.capacity ? ` · ${s.capacity} مقعد` : ''}</Tag>
              )) : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
            </div>
            <Button type="primary" block size="large" style={{ background: '#16a34a', borderColor: '#16a34a', fontWeight: 800 }}
              onClick={() => navigate(bookTo === '/' ? `/?date=${date?.format('YYYY-MM-DD')}` : bookTo)}>احجز هذا الخط</Button>
          </Card>
        </div>
      ) : (
        <Empty style={{ marginTop: 16 }} description="لا توجد رحلة تخدم هذا الاختيار. جرّب مركزاً أو جامعة أخرى." />
      ))}
    </Card>
  )
}

/* ---------- tourism request form ---------- */
function TourismForm({ data }: { data: any }) {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const [submit, { isLoading }] = usePublicTourismRequestMutation()
  const [done, setDone] = useState(false)

  const onFinish = async (v: any) => {
    try {
      await submit({ ...v, travel_date: v.travel_date.format('YYYY-MM-DD') }).unwrap()
      setDone(true); form.resetFields()
    } catch (e: any) {
      message.error(e?.data?.detail || 'تعذر إرسال الطلب')
    }
  }

  if (done) return (
    <Card><Result status="success" title="تم استلام طلبك"
      subTitle="سيتواصل معك فريق القاضي بعرض السعر قريباً."
      extra={<Button type="primary" onClick={() => setDone(false)}>طلب رحلة أخرى</Button>} /></Card>
  )

  return (
    <Card title={<span style={{ fontWeight: 800 }}><CompassOutlined style={{ color: '#7c3aed' }} /> طلب رحلة سياحية / مخصصة</span>}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="قدّم طلبك بالتفاصيل، وسيراجعه فريقنا ويرسل لك عرض سعر مخصص — لا حاجة لتسجيل الدخول." />
      <Form form={form} layout="vertical" onFinish={onFinish}
        initialValues={{ trip_type: 'private', travelers: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Form.Item name="full_name" label="الاسم" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="رقم الهاتف" rules={[{ required: true }, phoneRule]}><Input inputMode="numeric" maxLength={11} /></Form.Item>
          <Form.Item name="origin" label="من" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="destination" label="إلى" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="travel_date" label="تاريخ الرحلة" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="vehicle_type" label="نوع المركبة">
            <Select allowClear options={(data?.vehicle_types || []).map((v: any) => ({ value: v.id, label: `${v.name} (${v.capacity})` }))} />
          </Form.Item>
          <Form.Item name="travelers" label="عدد المسافرين"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="trip_type" label="نوع الرحلة">
            <Select options={[{ value: 'private', label: 'رحلة خاصة (مركبة كاملة)' }, { value: 'seat', label: 'فردي / بالمقعد' }]} />
          </Form.Item>
        </div>
        <Form.Item name="notes" label="ملاحظات"><Input.TextArea rows={2} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={isLoading} icon={<CompassOutlined />}>إرسال الطلب</Button>
      </Form>
    </Card>
  )
}

/* ---------- university routes catalogue ---------- */
function UniversityRoutes({ data, navigate, bookTo }: { data: any; navigate: any; bookTo: string }) {
  const [dest, setDest] = useState('all')
  const routes = data?.routes || []
  const destinations = Array.from(new Set(routes.map((r: any) => r.destination)))
  const filtered = dest === 'all' ? routes : routes.filter((r: any) => r.destination === dest)

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 22 }}>
        <Col xs={24} md={12}>
          <Card title={<span style={{ fontWeight: 800 }}><ClockCircleOutlined style={{ color: '#F07E1B' }} /> مواعيد الذهاب</span>}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(data?.morning_slots || []).map((s: any) => (
                <div key={s.time} style={{ border: '1px solid #eef1f6', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: '#0B2E5E', fontSize: 18 }}>{s.time}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{s.name}</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span style={{ fontWeight: 800 }}><RollbackOutlined style={{ color: '#F07E1B' }} /> مواعيد العودة</span>}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(data?.return_slots || []).map((s: any) => (
                <div key={s.time} style={{ border: '1px solid #eef1f6', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, color: '#0B2E5E', fontSize: 18 }}>{s.time}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{s.capacity} مقعد</div>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="sec-head" style={{ margin: 0 }}>خطوط السير المتاحة</div>
        <Segmented value={dest} onChange={(v) => setDest(v as string)}
          options={[{ value: 'all', label: 'كل الوجهات' }, ...destinations.map((d: any) => ({ value: d, label: d }))]} />
      </div>

      <Row gutter={[16, 16]}>
        {filtered.length === 0 && <Col span={24}><Empty description="لا توجد خطوط" /></Col>}
        {filtered.map((r: any) => (
          <Col xs={24} md={12} key={r.id}>
            <Card styles={{ body: { padding: 18 } }} style={{ height: '100%', borderTop: '4px solid #F07E1B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff6ee', color: '#F07E1B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                  <CarOutlined />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0B2E5E' }}>{r.name}</div>
                  <div style={{ color: '#64748b', fontSize: 13 }}>الوجهة: {r.destination}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {['term', 'monthly', 'daily'].filter((k) => r.prices[k] != null).map((k) => (
                  <div key={k} style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '6px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
                    <Tag color={TYPE_COLOR[k]} style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[k]}</Tag>
                    <div style={{ fontWeight: 800, color: '#0B2E5E', marginTop: 4 }}>{Number(r.prices[k]).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>ج.م</span></div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
                <EnvironmentOutlined style={{ color: '#F07E1B' }} /> نقاط الالتقاط:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {r.pickup_points.length ? r.pickup_points.map((p: any) => (
                  <Tag key={p.sequence} bordered style={{ borderRadius: 20 }}>{p.sequence}. {p.name}</Tag>
                )) : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
              </div>
              <Button type="primary" block onClick={() => navigate(bookTo === '/book' ? `/book?route=${r.id}` : bookTo)}>احجز هذا الخط</Button>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  )
}

export default function Explore() {
  const navigate = useNavigate()
  const { data } = useExploreQuery()
  const [mode, setMode] = useState<'uni' | 'tourism'>('uni')
  const user = useAppSelector((s) => s.auth.user)
  const isStudent = user?.role === 'student'
  const bookTo = isStudent ? '/' : '/login'

  return (
    <div>
      {/* main category switch */}
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <Segmented
          size="large" value={mode} onChange={(v) => setMode(v as any)}
          options={[
            { value: 'uni', label: <span style={{ padding: '0 10px' }}><CarOutlined /> رحلات الجامعات</span> },
            { value: 'tourism', label: <span style={{ padding: '0 10px' }}><CompassOutlined /> رحلات سياحية مخصصة</span> },
          ]}
        />
      </div>

      {/* go-bus style hero: bus + tagline on the right, search card on the left */}
      <section className="gb-hero">
        <div className="gb-hero-visual">
          <div className="gb-hero-title">
            {isStudent ? <>أهلاً {user?.full_name} 👋</> : <>أسرع وأريح وسيلة لرحلتك الجامعية</>}
          </div>
          <div className="gb-hero-sub">
            {isStudent ? 'اختر رحلتك واحجز مقعدك في دقيقة' : 'تصفّح المواعيد والأسعار بحرية — والتسجيل عند الحجز فقط'}
          </div>
          <img className="gb-hero-bus" src="/hero-bus.webp" alt="ELKADY TRAVEL" loading="eager"
            onError={(e) => { const t = e.currentTarget; const fb = t.dataset.fb || ''; if (!fb) { t.dataset.fb = '1'; t.src = '/hero-bus.png' } else if (fb === '1') { t.dataset.fb = '2'; t.src = '/card-bus.png' } }} />
        </div>
        <div className="gb-hero-search">
          {mode === 'uni'
            ? <AvailabilityChecker data={data} bookTo={bookTo} />
            : <TourismForm data={data} />}
        </div>
      </section>

      {mode === 'uni' && <UniversityRoutes data={data} navigate={navigate} bookTo={bookTo} />}

      {!user && (
        <Card style={{ marginTop: 22, textAlign: 'center', background: 'linear-gradient(120deg,#0B2E5E,#123a73 55%,#EC6A16)', border: 'none' }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>جاهز تحجز رحلتك؟</div>
          <div style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 16 }}>سجّل الدخول بحسابك أو أنشئ حساباً جديداً في دقيقة.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="large" icon={<LoginOutlined />} onClick={() => navigate('/login')}>تسجيل الدخول</Button>
            <Button size="large" type="primary" icon={<UserAddOutlined />} onClick={() => navigate('/register')}>إنشاء حساب جديد</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

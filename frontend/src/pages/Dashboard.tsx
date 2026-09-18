import { Card, Col, Row, Progress, Table, Tag, Switch, Space, TimePicker, App as AntdApp } from 'antd'
import dayjs from 'dayjs'
import {
  TeamOutlined, ClockCircleOutlined, DollarOutlined, CarOutlined,
  CompassOutlined, CheckCircleOutlined, WalletOutlined, RiseOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { CarOutlined as CarIcon, ToolOutlined, IdcardOutlined, ApartmentOutlined } from '@ant-design/icons'
import {
  useDashboardQuery, useDashboardChartsQuery, useFleetDashboardQuery,
  useCompanyQuery, useSaveCompanyMutation,
} from '../app/api'
import { useAppSelector } from '../app/store'
import { Donut, BarList, LineChart } from '../components/Charts'

function BookingTogglesCard() {
  const { message } = AntdApp.useApp()
  const { data: company } = useCompanyQuery()
  const [save, { isLoading }] = useSaveCompanyMutation()
  const toggle = async (field: string, value: boolean) => {
    try {
      await save({ [field]: value }).unwrap()
      message.success(value ? 'تم فتح الحجز' : 'تم إغلاق الحجز')
    } catch { message.error('تعذّر الحفظ') }
  }
  const rows: [string, string, boolean][] = [
    ['booking_term_open', 'حجز الترم', company?.booking_term_open !== false],
    ['booking_monthly_open', 'الحجز الشهري', company?.booking_monthly_open !== false],
    ['booking_daily_open', 'الحجز اليومي', company?.booking_daily_open !== false],
  ]
  const cutoff = company?.daily_booking_cutoff_time
  const cutoffValue = cutoff ? dayjs(cutoff, 'HH:mm:ss') : null
  const saveCutoff = async (t: dayjs.Dayjs | null) => {
    try {
      await save({ daily_booking_cutoff_time: t ? t.format('HH:mm:ss') : null }).unwrap()
      message.success(t ? `الحجز اليومي هيتقفل تلقائياً الساعة ${t.format('HH:mm')}` : 'تم إلغاء الإغلاق التلقائي بالوقت')
    } catch { message.error('تعذّر الحفظ') }
  }
  return (
    <Card size="small" style={{ marginBottom: 14 }}
      title={<span><LockOutlined /> <b>فتح / إغلاق الحجز للجميع</b></span>}
      extra={<Tag color="blue">يسري على جميع الطلاب فوراً</Tag>}>
      <Space size={24} wrap>
        {rows.map(([f, label, on]) => (
          <Space key={f}>
            <Switch checked={on} loading={isLoading} onChange={(v) => toggle(f, v)}
              checkedChildren="مفتوح" unCheckedChildren="مغلق" />
            <span style={{ fontWeight: 600 }}>{label}</span>
          </Space>
        ))}
      </Space>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600 }}>إغلاق الحجز اليومي تلقائياً بعد الساعة:</span>
        <TimePicker value={cutoffValue} onChange={saveCutoff} format="HH:mm" allowClear
          placeholder="بدون حد أقصى" style={{ width: 130 }} />
        <span style={{ color: '#64748b', fontSize: 12 }}>
          {cutoffValue
            ? `يُغلق الحجز اليومي تلقائياً من الساعة ${cutoffValue.format('HH:mm')} حتى منتصف الليل، ويُفتح تلقائياً بعدها.`
            : 'اتركه فارغاً لتعطيل الإغلاق التلقائي بالوقت (يظل الحجز مفتوحاً طوال اليوم ما دام مفتوحاً بالمفتاح أعلاه).'}
        </span>
      </div>
    </Card>
  )
}

function Section({ title, children }: any) {
  return <div style={{ marginBottom: 20 }}>
    <div className="sec-head">{title}</div>
    <Row gutter={[14, 14]}>{children}</Row>
  </div>
}
function Kpi({ title, value, suffix, icon, color }: any) {
  return <Col xs={12} md={8} lg={6}>
    <div className="kpi-tile" style={{ ['--kc' as any]: color }}>
      <div className="ico">{icon}</div>
      <div>
        <div className="n">{value}{suffix ? <span style={{ fontSize: 13, fontWeight: 600 }}> {suffix}</span> : ''}</div>
        <div className="l">{title}</div>
      </div>
    </div>
  </Col>
}

const ORANGE = '#F07E1B', NAVY = '#0B2E5E', GOLD = '#E0921A', GREEN = '#16a34a', RED = '#e11d48', PURPLE = '#7c3aed'
const LAYOUT_LABEL: Record<string, string> = { bus50: 'أتوبيس ٥٠', hiace15: 'هاي إيس ١٥' }

export default function Dashboard() {
  const { data } = useDashboardQuery(undefined, { pollingInterval: 60000 })
  const { data: charts } = useDashboardChartsQuery(undefined, { pollingInterval: 60000 })
  const { data: fleet } = useFleetDashboardQuery(undefined, { pollingInterval: 60000 })
  const user = useAppSelector((s) => s.auth.user)
  const s = data?.students, t = data?.transport, p = data?.payments, tr = data?.tourism

  const subSlices = [
    { label: 'ترم', value: charts?.sub_types?.term ?? 0, color: GREEN },
    { label: 'شهري', value: charts?.sub_types?.monthly ?? 0, color: ORANGE },
    { label: 'يومي', value: charts?.sub_types?.daily ?? 0, color: GOLD },
  ]
  const paySlices = [
    { label: 'مؤكدة', value: charts?.payments?.verified ?? 0, color: GREEN },
    { label: 'بانتظار المراجعة', value: charts?.payments?.pending ?? 0, color: GOLD },
    { label: 'مرفوضة', value: charts?.payments?.rejected ?? 0, color: RED },
  ]
  const seatSlices = [
    { label: 'مشغولة', value: charts?.overall?.occupied ?? 0, color: ORANGE },
    { label: 'متاحة', value: charts?.overall?.available ?? 0, color: '#cbd5e1' },
  ]

  return (
    <div>
      <div className="page-hero compact">
        <img src="/hero-b3.png" alt="ELKADY TRAVEL" />
        <div className="hero-bar">
          <span><b>لوحة تحكم الإدارة</b> — مرحباً {user?.full_name}</span>
          <span className="tag">— نظرة شاملة على التشغيل والمدفوعات والسياحة</span>
        </div>
      </div>

      <BookingTogglesCard />

      <Section title="الطلاب">
        <Kpi title="إجمالي الطلاب" value={s?.total ?? 0} icon={<TeamOutlined />} color={NAVY} />
        <Kpi title="مشتركون مؤكدون" value={s?.subscribed ?? 0} icon={<CheckCircleOutlined />} color={GREEN} />
        <Kpi title="مشتركو الترم" value={s?.term ?? 0} icon={<CheckCircleOutlined />} color={GREEN} />
        <Kpi title="مشتركو الشهري" value={s?.monthly ?? 0} icon={<CheckCircleOutlined />} color={ORANGE} />
        <Kpi title="قائمة الانتظار" value={s?.waiting ?? 0} icon={<ClockCircleOutlined />} color={GOLD} />
      </Section>

      {/* ---- 7-day passenger trend ---- */}
      <Card title={<span style={{ fontWeight: 800 }}>ركاب آخر ٧ أيام</span>}
        extra={<Tag color="orange">اتجاه الحجوزات</Tag>} style={{ marginBottom: 14 }}>
        <LineChart data={charts?.weekly || []} />
      </Card>

      {/* ---- Interactive charts ---- */}
      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={14}>
          <Card title={<span style={{ fontWeight: 800 }}>امتلاء الخطوط — رحلات الغد</span>}
            extra={<Tag color="blue">{charts?.date}</Tag>} style={{ height: '100%' }}>
            <BarList data={charts?.routes || []} />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={5}>
          <Card title={<span style={{ fontWeight: 800 }}>توزيع الاشتراكات</span>} style={{ height: '100%' }}>
            <Donut data={subSlices} centerLabel="مشترك" />
          </Card>
        </Col>
        <Col xs={24} md={12} lg={5}>
          <Card title={<span style={{ fontWeight: 800 }}>إشغال الغد</span>} style={{ height: '100%' }}>
            <Donut data={seatSlices} centerLabel="مقعد" />
          </Card>
        </Col>
      </Row>

      <Section title="الأسطول">
        <Kpi title="المركبات المتاحة" value={fleet?.vehicles_available ?? 0} icon={<CarIcon />} color={GREEN} />
        <Kpi title="في الرحلات" value={fleet?.vehicles_in_trip ?? 0} icon={<CarIcon />} color={ORANGE} />
        <Kpi title="في الصيانة" value={fleet?.vehicles_maintenance ?? 0} icon={<ToolOutlined />} color={GOLD} />
        <Kpi title="سائقون نشطون" value={fleet?.drivers_active ?? 0} icon={<IdcardOutlined />} color={NAVY} />
        <Kpi title="تعيينات اليوم" value={fleet?.assignments_today ?? 0} icon={<ApartmentOutlined />} color={PURPLE} />
        <Kpi title="مصروفات تحتاج مراجعة" value={fleet?.expenses_pending ?? 0} icon={<DollarOutlined />} color={GOLD} />
        <Kpi title="مصروفات اليوم" value={Number(fleet?.expenses_today ?? 0).toLocaleString()} suffix="ج.م" icon={<DollarOutlined />} color={GREEN} />
        <Kpi title="مصروفات الشهر" value={Number(fleet?.expenses_month ?? 0).toLocaleString()} suffix="ج.م" icon={<WalletOutlined />} color={NAVY} />
      </Section>

      <Section title="التشغيل">
        <Kpi title="رحلات اليوم" value={t?.today_trips ?? 0} icon={<CarOutlined />} color={NAVY} />
        <Kpi title="رحلات الغد" value={t?.tomorrow_trips ?? 0} icon={<CarOutlined />} color={ORANGE} />
        <Kpi title="ركاب الغد" value={t?.tomorrow_passengers ?? 0} icon={<TeamOutlined />} color={GREEN} />
        <Kpi title="مقاعد متاحة" value={t?.available_seats ?? 0} icon={<RiseOutlined />} color={PURPLE} />
      </Section>

      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={16}>
          <Card title={<span style={{ fontWeight: 800 }}>رحلات الغد والباصات</span>}>
            <Table
              rowKey={(r: any) => r.route + r.slot} size="small" pagination={false}
              scroll={{ x: 560 }}
              dataSource={charts?.trips || []}
              locale={{ emptyText: 'لا توجد رحلات للغد بعد' }}
              columns={[
                { title: 'المسار', dataIndex: 'route' },
                { title: 'الموعد', dataIndex: 'slot', render: (v) => <Tag color="blue">{v}</Tag> },
                { title: 'المركبة', dataIndex: 'layout', render: (v) => LAYOUT_LABEL[v] || v },
                { title: 'مشغول', render: (_, r: any) => `${r.occupied}/${r.capacity}` },
                { title: 'انتظار', dataIndex: 'waiting' },
                {
                  title: 'الامتلاء', render: (_, r: any) => (
                    <Progress percent={r.occupancy} size="small" style={{ width: 130 }}
                      strokeColor={r.occupancy >= 80 ? RED : r.occupancy >= 50 ? ORANGE : GREEN} />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<span style={{ fontWeight: 800 }}>حالة المدفوعات</span>} style={{ height: '100%' }}>
            <Donut data={paySlices} centerLabel="اشتراك" />
            <div style={{ marginTop: 16, textAlign: 'center', color: '#64748b' }}>
              إجمالي المُحصّل: <b style={{ color: NAVY }}>{Number(p?.collected ?? 0).toLocaleString()} ج.م</b>
            </div>
          </Card>
        </Col>
      </Row>

      <Section title="المدفوعات">
        <Kpi title="بانتظار المراجعة" value={p?.pending ?? 0} icon={<DollarOutlined />} color={GOLD} />
        <Kpi title="مؤكدة" value={p?.verified ?? 0} icon={<CheckCircleOutlined />} color={GREEN} />
        <Kpi title="مرفوضة" value={p?.rejected ?? 0} icon={<DollarOutlined />} color={RED} />
        <Kpi title="إجمالي المُحصّل" value={Number(p?.collected ?? 0).toLocaleString()} suffix="ج.م" icon={<WalletOutlined />} color={NAVY} />
      </Section>

      <Section title="السياحة">
        <Kpi title="طلبات جديدة" value={tr?.new ?? 0} icon={<CompassOutlined />} color={PURPLE} />
        <Kpi title="عروض مرسلة" value={tr?.quoted ?? 0} icon={<CompassOutlined />} color={ORANGE} />
        <Kpi title="مقبولة" value={tr?.accepted ?? 0} icon={<CheckCircleOutlined />} color={GREEN} />
        <Kpi title="مرفوضة" value={tr?.rejected ?? 0} icon={<CompassOutlined />} color={RED} />
      </Section>
    </div>
  )
}

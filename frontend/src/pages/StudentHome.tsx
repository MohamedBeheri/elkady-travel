import { Card, Col, Row, Table, Tag, Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { usePricesQuery, useCompanyQuery } from '../app/api'
import { useAppSelector } from '../app/store'

const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }

const ACTIONS = [
  { emoji: '🎫', label: 'حجز اشتراك', desc: 'ترم / شهري / يومي بسعر واضح', to: '/book', img: '/card-scenery.png' },
  { emoji: '🚌', label: 'حجز رحلة الغد', desc: 'اختر مقعدك من الخريطة', to: '/daily', img: '/card-bus.png' },
  { emoji: '🔳', label: 'تذاكري و QR', desc: 'رقم مقعدك ورمز الدخول', to: '/tickets', img: '/card-van.png' },
  { emoji: '↩️', label: 'رحلة العودة', desc: 'اختر موعد عودتك', to: '/return', img: '/card-palms.png' },
]

export default function StudentHome() {
  const navigate = useNavigate()
  const user = useAppSelector((s) => s.auth.user)
  const { data: prices } = usePricesQuery({ active: true })
  const { data: company } = useCompanyQuery()

  return (
    <div>
      <div className="page-hero">
        <img src="/hero-b2.png" alt="ELKADY TRAVEL" />
        <div className="hero-bar">
          <span>أهلاً <b>{user?.full_name}</b> 👋</span>
          <span className="tag">— {company?.tagline || 'اختر مقعدك، تابع الدفع، وابدأ يومك بدون قلق.'}</span>
        </div>
      </div>

      <Row gutter={[18, 18]} style={{ marginBottom: 22 }}>
        {ACTIONS.map((a) => (
          <Col xs={12} md={6} key={a.to}>
            <div className="img-card" onClick={() => navigate(a.to)}>
              <div className="thumb" style={{ backgroundImage: `url(${a.img})` }}>
                <div className="ic">{a.emoji}</div>
              </div>
              <div className="body">
                <h3>{a.label}</h3>
                <p>{a.desc}</p>
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Card
        title={<span style={{ fontWeight: 800 }}>العروض والأسعار</span>}
        extra={<Button type="primary" onClick={() => navigate('/book')}>احجز الآن</Button>}
      >
        <Table
          size="middle"
          rowKey="id"
          pagination={false}
          dataSource={prices?.results || []}
          columns={[
            { title: 'نوع الاشتراك', dataIndex: 'type_display', render: (_, r: any) => <Tag color="orange">{TYPE_LABEL[r.subscription_type]}</Tag> },
            { title: 'المسار', dataIndex: 'route_name' },
            { title: 'السعر', dataIndex: 'price', render: (v: string) => <b style={{ color: '#0B2E5E' }}>{`${Number(v).toLocaleString()} ج.م`}</b> },
          ]}
        />
      </Card>
    </div>
  )
}

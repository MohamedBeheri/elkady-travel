import { Button, Card, Col, Row, Tag, Segmented, Empty, Divider } from 'antd'
import {
  EnvironmentOutlined, ClockCircleOutlined, RollbackOutlined, CarOutlined,
  LoginOutlined, UserAddOutlined, PhoneOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExploreQuery } from '../app/api'

const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }
const TYPE_COLOR: Record<string, string> = { term: 'green', monthly: 'orange', daily: 'gold' }

export default function Explore() {
  const navigate = useNavigate()
  const { data } = useExploreQuery()
  const [dest, setDest] = useState('all')

  const routes = data?.routes || []
  const destinations = Array.from(new Set(routes.map((r: any) => r.destination)))
  const filtered = dest === 'all' ? routes : routes.filter((r: any) => r.destination === dest)

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f8' }}>
      {/* top nav */}
      <div style={{ background: '#0B2E5E', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="القاضي" style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff' }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>القاضي</div>
            <div style={{ fontSize: 10, color: '#F5A44E', fontWeight: 700, letterSpacing: 1 }}>ELKADY TRAVEL</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button icon={<LoginOutlined />} onClick={() => navigate('/login')} ghost>دخول</Button>
          <Button icon={<UserAddOutlined />} type="primary" onClick={() => navigate('/register')}>حساب جديد</Button>
        </div>
      </div>

      {/* hero */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 16px 40px' }}>
        <div className="page-hero" style={{ marginTop: 18 }}>
          <img src="/hero-b1.png" alt="ELKADY TRAVEL" />
          <div className="hero-bar">
            <span><b>خطوط السير والمواعيد والأسعار</b></span>
            <span className="tag">— تصفّح بحرية، وسجّل الدخول عند الحجز</span>
          </div>
        </div>

        {/* filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div className="sec-head" style={{ margin: 0 }}>خطوط السير المتاحة</div>
          <Segmented
            value={dest} onChange={(v) => setDest(v as string)}
            options={[{ value: 'all', label: 'كل الوجهات' }, ...destinations.map((d: any) => ({ value: d, label: d }))]}
          />
        </div>

        {/* routes grid */}
        <Row gutter={[16, 16]}>
          {filtered.length === 0 && <Col span={24}><Empty description="لا توجد خطوط" /></Col>}
          {filtered.map((r: any) => (
            <Col xs={24} md={12} key={r.id}>
              <Card
                styles={{ body: { padding: 18 } }}
                style={{ height: '100%', borderTop: '4px solid #F07E1B' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff6ee', color: '#F07E1B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                    <CarOutlined />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: '#0B2E5E' }}>{r.name}</div>
                    <div style={{ color: '#64748b', fontSize: 13 }}>الوجهة: {r.destination}</div>
                  </div>
                </div>

                {/* prices */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {['term', 'monthly', 'daily'].filter((k) => r.prices[k] != null).map((k) => (
                    <div key={k} style={{ border: '1px solid #eef1f6', borderRadius: 10, padding: '6px 12px', textAlign: 'center', flex: 1, minWidth: 90 }}>
                      <Tag color={TYPE_COLOR[k]} style={{ marginInlineEnd: 0 }}>{TYPE_LABEL[k]}</Tag>
                      <div style={{ fontWeight: 800, color: '#0B2E5E', marginTop: 4 }}>{Number(r.prices[k]).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600 }}>ج.م</span></div>
                    </div>
                  ))}
                </div>

                {/* pickup points */}
                <div style={{ fontSize: 13, color: '#334155', marginBottom: 6 }}>
                  <EnvironmentOutlined style={{ color: '#F07E1B' }} /> نقاط الالتقاط:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {r.pickup_points.length ? r.pickup_points.map((p: any) => (
                    <Tag key={p.sequence} bordered style={{ borderRadius: 20 }}>{p.sequence}. {p.name}</Tag>
                  )) : <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>}
                </div>

                <Button type="primary" block onClick={() => navigate('/login')}>احجز هذا الخط</Button>
              </Card>
            </Col>
          ))}
        </Row>

        {/* schedules */}
        <Row gutter={[16, 16]} style={{ marginTop: 22 }}>
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

        {/* CTA */}
        <Card style={{ marginTop: 22, textAlign: 'center', background: 'linear-gradient(120deg,#0B2E5E,#123a73 55%,#EC6A16)', border: 'none' }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginBottom: 6 }}>جاهز تحجز رحلتك؟</div>
          <div style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 16 }}>سجّل الدخول بحسابك أو أنشئ حساباً جديداً في دقيقة.</div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="large" icon={<LoginOutlined />} onClick={() => navigate('/login')}>تسجيل الدخول</Button>
            <Button size="large" type="primary" icon={<UserAddOutlined />} onClick={() => navigate('/register')}>إنشاء حساب جديد</Button>
          </div>
        </Card>

        <Divider />
        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          {data?.company?.phone && <div><PhoneOutlined /> {data.company.phone}</div>}
          <div style={{ marginTop: 6 }}>القاضي — ELKADY TRAVEL · جميع الحقوق محفوظة</div>
        </div>
      </div>
    </div>
  )
}

import { Card, Row, Col, Tag, Empty, Descriptions } from 'antd'
import { useMyTicketsQuery } from '../app/api'
import KaffoCredit from '../components/KaffoCredit'

const STATUS_COLOR: Record<string, string> = { confirmed: 'green', held: 'orange', absent: 'red' }

export default function Tickets() {
  const { data } = useMyTicketsQuery()
  const tickets = data || []

  return (
    <Card title="تذاكري">
      {tickets.length === 0 && <Empty description="لا توجد تذاكر بعد — احجز مقعداً من صفحة الحجز اليومي" />}
      <Row gutter={[16, 16]}>
        {tickets.map((t: any) => (
          <Col xs={24} md={12} lg={8} key={`${t.kind}-${t.id}`}>
            <div style={{ border: '1px solid #e6ebf3', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
              <div style={{ background: t.kind === 'term' ? '#0B2E5E' : '#F07E1B', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>القاضي — ELKADY TRAVEL</div>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>{t.kind === 'term' ? 'تذكرة ترم' : 'تذكرة يومية'}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>المقعد</div>
                  <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{t.seat_number}</div>
                </div>
              </div>
              <div style={{ padding: 16, textAlign: 'center' }}>
                {t.qr ? (
                  <img src={t.qr} alt="QR" style={{ width: 150, height: 150 }} />
                ) : (
                  <div style={{ width: 150, height: 150, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff7ed', borderRadius: 12, color: '#b45309', fontSize: 13, padding: 12 }}>
                    يظهر رمز QR بعد تأكيد الدفع من الإدارة
                  </div>
                )}
                <Descriptions column={1} size="small" style={{ marginTop: 12, textAlign: 'right' }}>
                  <Descriptions.Item label="المسار">{t.route}</Descriptions.Item>
                  <Descriptions.Item label="الموعد">{t.slot}</Descriptions.Item>
                  <Descriptions.Item label="التاريخ">{t.date}</Descriptions.Item>
                  {t.pickup_name && <Descriptions.Item label={t.direction === 'return' ? 'نقطة النزول' : 'نقطة الالتقاط'}>{t.pickup_name}</Descriptions.Item>}
                  {t.pickup_time && <Descriptions.Item label={t.direction === 'return' ? 'موعد النزول' : 'موعد الالتقاط'}>
                    <b style={{ color: '#0B2E5E', fontSize: 15 }}>⏰ {t.pickup_time}</b>
                  </Descriptions.Item>}
                  <Descriptions.Item label="الحالة"><Tag color={STATUS_COLOR[t.status] || 'default'}>{t.status_display}</Tag></Descriptions.Item>
                  <Descriptions.Item label="الرقم المرجعي">{t.token}</Descriptions.Item>
                </Descriptions>
              </div>
              <div style={{ borderTop: '1px dashed #e6ebf3', padding: '10px 12px' }}>
                <KaffoCredit />
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  )
}

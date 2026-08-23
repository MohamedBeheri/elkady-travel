import { Card, Col, Row, Table, Tag, DatePicker, Empty, Alert } from 'antd'
import {
  CarOutlined, TeamOutlined, IdcardOutlined, ApartmentOutlined, WarningOutlined, DollarOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useOperationsDashboardQuery } from '../../app/api'

const NAVY = '#0B2E5E', ORANGE = '#F07E1B', GREEN = '#16a34a', RED = '#e11d48', GOLD = '#E0921A', PURPLE = '#7c3aed'

function Kpi({ title, value, icon, color }: any) {
  return (
    <Col xs={12} md={8} lg={4}>
      <div className="kpi-tile" style={{ ['--kc' as any]: color }}>
        <div className="ico">{icon}</div>
        <div><div className="n">{value}</div><div className="l">{title}</div></div>
      </div>
    </Col>
  )
}

export default function OperationsDashboard() {
  const [date, setDate] = useState(dayjs())
  const { data, isFetching } = useOperationsDashboardQuery({ date: date.format('YYYY-MM-DD') })
  const k = data?.kpis || {}

  return (
    <div>
      <div className="page-hero compact" style={{ marginBottom: 18 }}>
        <img src="/hero-b2.png" alt="ELKADY TRAVEL" />
        <div className="hero-bar"><span><b>لوحة المشرف التشغيلية</b></span><span className="tag">— متابعة رحلات اليوم والتعيينات</span></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
      </div>

      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        <Kpi title="رحلات اليوم" value={k.trips ?? 0} icon={<CarOutlined />} color={NAVY} />
        <Kpi title="الركاب" value={k.passengers ?? 0} icon={<TeamOutlined />} color={GREEN} />
        <Kpi title="المركبات" value={k.vehicles ?? 0} icon={<ApartmentOutlined />} color={ORANGE} />
        <Kpi title="السائقون" value={k.drivers ?? 0} icon={<IdcardOutlined />} color={PURPLE} />
        <Kpi title="رحلات بلا تعيين" value={k.missing_assignments ?? 0} icon={<WarningOutlined />} color={RED} />
        <Kpi title="مصروفات للمراجعة" value={k.pending_expenses ?? 0} icon={<DollarOutlined />} color={GOLD} />
      </Row>

      {(data?.missing?.length ?? 0) > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="رحلات بدون تعيين مركبة/سائق"
          description={data.missing.map((m: any) => `${m.route} (${m.slot})`).join('، ')} />
      )}

      <Row gutter={[14, 14]}>
        <Col xs={24} lg={16}>
          <Card title={<span style={{ fontWeight: 800 }}>رحلات اليوم والتعيينات</span>}>
            <Table
              rowKey="id" loading={isFetching} dataSource={data?.trips || []} scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty description="لا توجد رحلات لهذا اليوم" /> }}
              columns={[
                { title: 'الموعد', dataIndex: 'slot', render: (v) => <Tag color="blue">{v}</Tag> },
                { title: 'الخط', dataIndex: 'route' },
                { title: 'الوجهة', dataIndex: 'destination' },
                { title: 'الركاب', render: (_, r: any) => `${r.passengers}/${r.capacity}` },
                { title: 'المركبة', dataIndex: 'vehicle', render: (v) => v || <Tag color="red">غير معيّنة</Tag> },
                { title: 'السائق', dataIndex: 'driver', render: (v) => v || '—' },
                { title: 'الحالة', render: (_, r: any) => r.assigned ? <Tag color="green">معيّنة</Tag> : <Tag color="red">تحتاج تعيين</Tag> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={<span style={{ fontWeight: 800 }}>توزيع نقاط الالتقاط</span>}>
            {(data?.pickup_distribution?.length ?? 0) === 0 && <Empty description="لا يوجد ركاب" />}
            {(data?.pickup_distribution || []).map((p: any) => {
              const max = data.pickup_distribution[0].count || 1
              return (
                <div key={p.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{p.name}</span><b>{p.count}</b>
                  </div>
                  <div style={{ height: 8, background: '#eef2f7', borderRadius: 6 }}>
                    <div style={{ width: `${(p.count / max) * 100}%`, height: '100%', background: ORANGE, borderRadius: 6 }} />
                  </div>
                </div>
              )
            })}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

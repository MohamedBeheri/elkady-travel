import { Card, Table, DatePicker, Statistic, Row, Col } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useVehicleExpenseReportQuery } from '../../app/api'

export default function FleetReports() {
  const [month, setMonth] = useState(dayjs())
  const ms = month.format('YYYY-MM')
  const { data, isFetching } = useVehicleExpenseReportQuery({ month: ms })
  const money = (v: number) => `${Number(v || 0).toLocaleString()}`

  return (
    <Card title={<span style={{ fontWeight: 800 }}>تقرير مصروفات المركبات الشهري</span>}
      extra={<DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} />}>
      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><Card><Statistic title="إجمالي مصروفات الشهر" value={money(data?.grand_total)} suffix="ج.م" /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="عدد المركبات" value={data?.rows?.length || 0} /></Card></Col>
      </Row>
      <Table
        rowKey="vehicle_id" loading={isFetching} dataSource={data?.rows || []} scroll={{ x: 'max-content' }}
        pagination={false}
        columns={[
          { title: 'المركبة', dataIndex: 'vehicle' },
          { title: 'الرحلات', dataIndex: 'trips' },
          { title: 'السائقون', dataIndex: 'drivers', render: (v: any) => (v || []).join('، ') || '—' },
          { title: 'الوقود', dataIndex: 'fuel', render: money },
          { title: 'الكارتات', dataIndex: 'tolls', render: money },
          { title: 'أخرى', dataIndex: 'other', render: money },
          { title: 'الصيانة', dataIndex: 'maintenance', render: money },
          { title: 'الورش', dataIndex: 'workshop', render: money },
          { title: 'الغرامات', dataIndex: 'fines', render: money },
          { title: 'الإجمالي', dataIndex: 'grand_total', render: (v: any) => <b style={{ color: '#0B2E5E' }}>{money(v)} ج.م</b> },
        ]}
        summary={(rows) => {
          const sum = (k: string) => rows.reduce((s: number, r: any) => s + (r[k] || 0), 0)
          return (
            <Table.Summary.Row style={{ background: '#fff6ee', fontWeight: 800 }}>
              <Table.Summary.Cell index={0}>الإجمالي</Table.Summary.Cell>
              <Table.Summary.Cell index={1} colSpan={2} />
              <Table.Summary.Cell index={3}>{money(sum('fuel'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={4}>{money(sum('tolls'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={5}>{money(sum('other'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={6}>{money(sum('maintenance'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={7}>{money(sum('workshop'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={8}>{money(sum('fines'))}</Table.Summary.Cell>
              <Table.Summary.Cell index={9}>{money(sum('grand_total'))} ج.م</Table.Summary.Cell>
            </Table.Summary.Row>
          )
        }}
      />
    </Card>
  )
}

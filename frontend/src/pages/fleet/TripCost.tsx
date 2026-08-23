import { Card, Table, DatePicker, Select, Statistic } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useTripCostReportQuery, useRoutesQuery } from '../../app/api'

export default function TripCost() {
  const [month, setMonth] = useState(dayjs())
  const [route, setRoute] = useState<number>()
  const { data, isFetching } = useTripCostReportQuery({ month: month.format('YYYY-MM'), route })
  const { data: routes } = useRoutesQuery({ active: true })
  const money = (v: number) => `${Number(v || 0).toLocaleString()}`

  return (
    <Card title={<span style={{ fontWeight: 800 }}>تكلفة تشغيل الرحلات</span>}
      extra={
        <div style={{ display: 'flex', gap: 10 }}>
          <Select placeholder="كل الخطوط" allowClear style={{ width: 200 }} value={route} onChange={setRoute}
            options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))} />
          <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} />
        </div>
      }>
      <div style={{ marginBottom: 16 }}>
        <Card size="small" style={{ maxWidth: 300 }}>
          <Statistic title="إجمالي تكلفة رحلات الشهر" value={money(data?.total)} suffix="ج.م" valueStyle={{ color: '#0B2E5E' }} />
        </Card>
      </div>
      <Table
        rowKey="assignment_id" loading={isFetching} dataSource={data?.rows || []} scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'لا توجد رحلات في هذا الشهر' }}
        columns={[
          { title: 'التاريخ', dataIndex: 'date' },
          { title: 'الخط', dataIndex: 'route' },
          { title: 'المركبة', dataIndex: 'vehicle' },
          { title: 'السائق', dataIndex: 'driver' },
          { title: 'الوقود', dataIndex: 'fuel', render: money },
          { title: 'الكارتات', dataIndex: 'tolls', render: money },
          { title: 'أخرى', dataIndex: 'other', render: money },
          { title: 'تكلفة الرحلة', dataIndex: 'trip_cost', render: (v: any) => <b style={{ color: '#F07E1B' }}>{money(v)} ج.م</b> },
        ]}
      />
      <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 12 }}>
        * تكلفة الرحلة = الوقود + الكارتات + المصروفات الأخرى المعتمدة فقط (لا تشمل الصيانة/الورش/الغرامات).
      </div>
    </Card>
  )
}

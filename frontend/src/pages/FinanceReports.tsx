import { Card, Col, DatePicker, Radio, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import { useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import { useFinanceReportQuery } from '../app/api'

type Mode = 'day' | 'month' | 'range'

const TYPE_LABEL: Record<string, string> = {
  term: 'ترم',
  monthly: 'شهري',
  daily: 'يومي',
  daily_go: 'يومي — ذهاب',
  daily_return: 'يومي — عودة',
  daily_round: 'يومي — ذهاب/عودة',
}

export default function FinanceReports() {
  const [mode, setMode] = useState<Mode>('month')
  const [day, setDay] = useState<Dayjs>(dayjs())
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()])

  const params = useMemo(() => {
    if (mode === 'day') {
      const s = day.format('YYYY-MM-DD')
      return { start: s, end: s }
    }
    if (mode === 'month') return { month: month.format('YYYY-MM') }
    return { start: range[0].format('YYYY-MM-DD'), end: range[1].format('YYYY-MM-DD') }
  }, [mode, day, month, range])

  const { data, isFetching } = useFinanceReportQuery(params)
  const money = (v: number) => `${Number(v || 0).toLocaleString()}`

  const collections = data?.collections || {}
  const expenses = data?.expenses || {}
  const totals = data?.totals || {}
  const net = Number(totals.net_profit || 0)

  const collectionRows = [
    { key: 'term', label: 'اشتراك ترم', ...(collections.term || {}) },
    { key: 'monthly', label: 'اشتراك شهري', ...(collections.monthly || {}) },
    { key: 'daily', label: 'اشتراك يومي', ...(collections.daily || {}) },
  ]

  const expenseRows = [
    { key: 'fuel', label: 'وقود', amount: expenses.fuel || 0 },
    { key: 'tolls', label: 'كارتات / رسوم طرق', amount: expenses.tolls || 0 },
    { key: 'other', label: 'مصروفات أخرى', amount: expenses.other || 0 },
    { key: 'maintenance', label: 'صيانة', amount: expenses.maintenance || 0 },
    { key: 'workshop', label: 'ورش', amount: expenses.workshop || 0 },
    { key: 'fines', label: 'غرامات مرورية', amount: expenses.fines || 0 },
  ]

  return (
    <Card
      title={<span style={{ fontWeight: 800 }}>التقارير المالية</span>}
      extra={
        <Space wrap>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="day">يوم</Radio.Button>
            <Radio.Button value="month">شهر</Radio.Button>
            <Radio.Button value="range">فترة</Radio.Button>
          </Radio.Group>
          {mode === 'day' && (
            <DatePicker value={day} onChange={(d) => d && setDay(d)} allowClear={false} />
          )}
          {mode === 'month' && (
            <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} />
          )}
          {mode === 'range' && (
            <DatePicker.RangePicker
              value={range}
              onChange={(v) => v && v[0] && v[1] && setRange([v[0], v[1]])}
              allowClear={false}
            />
          )}
        </Space>
      }
    >
      {data?.range && (
        <div style={{ marginBottom: 12, color: '#64748b' }}>
          الفترة: <b>{data.range.start}</b> إلى <b>{data.range.end}</b>
        </div>
      )}

      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}>
          <Card><Statistic title="إجمالي التحصيلات" value={money(totals.collections)} suffix="ج.م"
            valueStyle={{ color: '#059669' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="إجمالي المصروفات" value={money(totals.expenses)} suffix="ج.م"
            valueStyle={{ color: '#dc2626' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="صافي الربح" value={money(net)} suffix="ج.م"
            valueStyle={{ color: net >= 0 ? '#0B2E5E' : '#dc2626', fontWeight: 800 }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card><Statistic title="عدد الاشتراكات المؤكدة" value={totals.subscriptions_count || 0} /></Card>
        </Col>
      </Row>

      <Row gutter={[14, 14]}>
        <Col xs={24} lg={12}>
          <Card title="التحصيلات حسب نوع الاشتراك" size="small">
            <Table
              size="small" rowKey="key" pagination={false} loading={isFetching}
              dataSource={collectionRows}
              columns={[
                { title: 'النوع', dataIndex: 'label' },
                { title: 'العدد', dataIndex: 'count', width: 90, align: 'center' },
                { title: 'الإجمالي', dataIndex: 'total', align: 'left',
                  render: (v: any) => <b style={{ color: '#059669' }}>{money(v)} ج.م</b> },
              ]}
              summary={() => (
                <Table.Summary.Row style={{ background: '#ecfdf5', fontWeight: 800 }}>
                  <Table.Summary.Cell index={0}>الإجمالي</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">{totals.subscriptions_count || 0}</Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="left">{money(totals.collections)} ج.م</Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="المصروفات" size="small">
            <Table
              size="small" rowKey="key" pagination={false} loading={isFetching}
              dataSource={expenseRows}
              columns={[
                { title: 'البند', dataIndex: 'label' },
                { title: 'المبلغ', dataIndex: 'amount', align: 'left',
                  render: (v: any) => <span style={{ color: '#dc2626' }}>{money(v)} ج.م</span> },
              ]}
              summary={() => (
                <Table.Summary.Row style={{ background: '#fef2f2', fontWeight: 800 }}>
                  <Table.Summary.Cell index={0}>الإجمالي</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="left">{money(totals.expenses)} ج.م</Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="آخر الاشتراكات المؤكدة في هذه الفترة" style={{ marginTop: 18 }}>
        <Table
          size="small" rowKey="id" pagination={{ pageSize: 20, showSizeChanger: false }}
          loading={isFetching} dataSource={data?.recent_subscriptions || []}
          scroll={{ x: 720 }}
          columns={[
            { title: 'الطالب', dataIndex: 'student' },
            { title: 'الهاتف', dataIndex: 'phone', width: 120 },
            { title: 'الخط', dataIndex: 'route' },
            { title: 'النوع', dataIndex: 'type', width: 130,
              render: (t: string) => <Tag color="blue">{TYPE_LABEL[t] || t}</Tag> },
            { title: 'المبلغ', dataIndex: 'amount', align: 'left', width: 130,
              render: (v: any) => <b>{money(v)} ج.م</b> },
            { title: 'وقت التأكيد', dataIndex: 'verified_at', width: 170,
              render: (v: any) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—' },
          ]}
        />
      </Card>

      <Typography.Paragraph type="secondary" style={{ marginTop: 14, marginBottom: 0, fontSize: 12 }}>
        * التحصيلات تعتمد على الاشتراكات المؤكدة (تمت المراجعة والاعتماد) في الفترة المختارة.
        صافي الربح = التحصيلات − (وقود + كارتات + مصروفات أخرى مقبولة + صيانة + ورش + غرامات).
      </Typography.Paragraph>
    </Card>
  )
}

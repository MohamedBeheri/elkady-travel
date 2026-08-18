import { Card, Table, Tag, Segmented, Select, Space } from 'antd'
import { useState } from 'react'
import { useSubscriptionsQuery, useRoutesQuery, useUniversitiesQuery } from '../app/api'

const STATUS_COLOR: Record<string, string> = {
  payment_pending: 'orange', payment_submitted: 'blue', under_review: 'blue',
  confirmed: 'green', rejected: 'red', cancelled: 'default', expired: 'default',
}

export default function Subscriptions() {
  const [type, setType] = useState('all')
  const [route, setRoute] = useState<number>()
  const [university, setUniversity] = useState<number>()
  const [status, setStatus] = useState<string>()

  const { data: routes } = useRoutesQuery({ active: true })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const params: any = { route, university, status }
  if (type !== 'all') params.subscription_type = type
  const { data, isFetching } = useSubscriptionsQuery(params)

  return (
    <Card
      title="الطلاب والاشتراكات"
      extra={
        <Space wrap>
          <Select placeholder="المسار" allowClear style={{ width: 170 }} value={route} onChange={setRoute}
            options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))} />
          <Select placeholder="الجامعة" allowClear style={{ width: 160 }} value={university} onChange={setUniversity}
            options={(unis?.results || []).map((u: any) => ({ value: u.id, label: u.name }))} />
          <Select placeholder="الحالة" allowClear style={{ width: 140 }} value={status} onChange={setStatus}
            options={[
              { value: 'confirmed', label: 'مؤكد' }, { value: 'payment_submitted', label: 'قيد المراجعة' },
              { value: 'rejected', label: 'مرفوض' }, { value: 'payment_pending', label: 'بانتظار الدفع' },
            ]} />
        </Space>
      }
    >
      <Segmented
        style={{ marginBottom: 16 }}
        value={type} onChange={(v) => setType(v as string)}
        options={[
          { value: 'all', label: 'الكل' }, { value: 'term', label: 'ترم' },
          { value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' },
        ]}
      />
      <Table
        rowKey="id" loading={isFetching} scroll={{ x: 800 }}
        dataSource={data?.results || []}
        columns={[
          { title: 'الطالب', dataIndex: 'student_name' },
          { title: 'الرقم القومي', dataIndex: 'student_national_id' },
          { title: 'الهاتف', dataIndex: 'student_phone' },
          { title: 'النوع', dataIndex: 'type_display', render: (v) => <Tag color="cyan">{v}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'الوجهة', dataIndex: 'destination_name' },
          { title: 'الجامعة', dataIndex: 'university_name' },
          { title: 'نقطة الالتقاط', dataIndex: 'pickup_name', render: (v) => v || '—' },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
        ]}
      />
    </Card>
  )
}

import { Card, Table, Tag, Select, Space, Segmented } from 'antd'
import { useState } from 'react'
import { useSeatRequestsQuery } from '../app/api'

const STATUS_COLOR: Record<string, string> = { waiting: 'orange', confirmed: 'green', cancelled: 'default' }
const PRIORITY_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }
const PRIORITY_COLOR: Record<string, string> = { term: 'green', monthly: 'blue', daily: 'orange' }

export default function WaitingLists() {
  const [status, setStatus] = useState('waiting')
  const [priority, setPriority] = useState<string>()
  const params: any = {}
  if (status !== 'all') params.status = status
  if (priority) params.priority_type = priority
  const { data, isFetching } = useSeatRequestsQuery(params)

  return (
    <Card
      title="قوائم الانتظار والمقاعد اليومية"
      extra={
        <Space wrap>
          <Select placeholder="الأولوية" allowClear style={{ width: 130 }} value={priority} onChange={setPriority}
            options={[{ value: 'term', label: 'ترم' }, { value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]} />
        </Space>
      }
    >
      <Segmented
        style={{ marginBottom: 16 }}
        value={status} onChange={(v) => setStatus(v as string)}
        options={[
          { value: 'waiting', label: 'قائمة الانتظار' }, { value: 'confirmed', label: 'مؤكد' },
          { value: 'all', label: 'الكل' },
        ]}
      />
      <Table
        rowKey="id" loading={isFetching} scroll={{ x: 800 }}
        dataSource={(data?.results || []).slice().sort((a: any, b: any) => a.requested_at.localeCompare(b.requested_at))}
        columns={[
          { title: 'ترتيب', dataIndex: 'queue_position', render: (v) => v || '—', width: 70 },
          { title: 'الطالب', dataIndex: 'student_name' },
          { title: 'الهاتف', dataIndex: 'student_phone' },
          { title: 'الرحلة', dataIndex: 'daily_trip' },
          { title: 'الأولوية', dataIndex: 'priority_type', render: (v) => <Tag color={PRIORITY_COLOR[v]}>{PRIORITY_LABEL[v]}</Tag> },
          { title: 'الجامعة', dataIndex: 'university_name' },
          { title: 'وقت الطلب', dataIndex: 'requested_at', render: (v) => new Date(v).toLocaleString('ar-EG') },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
        ]}
      />
    </Card>
  )
}

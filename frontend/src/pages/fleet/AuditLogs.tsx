import { Card, Table, Tag, Select } from 'antd'
import { useState } from 'react'
import { useAuditLogsQuery } from '../../app/api'

const ACTION_LABEL: Record<string, string> = {
  create: 'إضافة', update: 'تعديل', assign: 'تعيين', start_trip: 'بدء رحلة', complete_trip: 'إنهاء رحلة',
  approve_expense: 'اعتماد مصروف', reject_expense: 'رفض مصروف',
}
const ACTION_COLOR: Record<string, string> = {
  create: 'green', update: 'blue', assign: 'cyan', approve_expense: 'green', reject_expense: 'red',
  start_trip: 'orange', complete_trip: 'purple',
}

export default function AuditLogs() {
  const [entity, setEntity] = useState<string>()
  const { data, isFetching } = useAuditLogsQuery({ entity })

  return (
    <Card title={<span style={{ fontWeight: 800 }}>سجل التدقيق</span>}
      extra={<Select placeholder="كل الكيانات" allowClear style={{ width: 200 }} value={entity} onChange={setEntity}
        options={['Vehicle', 'Driver', 'VehicleAssignment', 'TripExpense', 'Maintenance', 'TrafficFine'].map((e) => ({ value: e, label: e }))} />}>
      <Table
        rowKey="id" loading={isFetching} dataSource={data?.results || []} scroll={{ x: 'max-content' }}
        columns={[
          { title: 'التاريخ', dataIndex: 'created_at', render: (v: any) => new Date(v).toLocaleString('ar-EG') },
          { title: 'المستخدم', dataIndex: 'user_name', render: (v: any) => v || '—' },
          { title: 'العملية', dataIndex: 'action', render: (v: any) => <Tag color={ACTION_COLOR[v] || 'default'}>{ACTION_LABEL[v] || v}</Tag> },
          { title: 'الكيان', dataIndex: 'entity' },
          { title: 'الوصف', dataIndex: 'summary', render: (v: any) => v || '—' },
        ]} />
    </Card>
  )
}

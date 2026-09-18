import { Card, Table } from 'antd'
import dayjs from 'dayjs'
import { useDailyReschedulesQuery } from '../app/api'

export default function RescheduleLog() {
  const { data, isFetching } = useDailyReschedulesQuery()
  const rows = data?.results || data || []

  return (
    <Card title="طلبات التأجيل للرحلات اليومية">
      <Table
        rowKey="id" loading={isFetching} dataSource={rows} scroll={{ x: 900 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        columns={[
          { title: 'الطالب', dataIndex: 'student_name' },
          { title: 'الهاتف', dataIndex: 'student_phone' },
          { title: 'الرحلة القديمة', dataIndex: 'old_trip_label' },
          { title: 'الرحلة الجديدة', dataIndex: 'new_trip_label' },
          { title: 'وقت التأجيل', dataIndex: 'created_at', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
        ]}
      />
    </Card>
  )
}

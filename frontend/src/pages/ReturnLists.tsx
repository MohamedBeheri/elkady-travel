import { Card, DatePicker, Select, Space, Table, Tag, Divider, Empty } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useReturnSlotsQuery, useReturnPassengersQuery, useReturnAvailabilityQuery } from '../app/api'

export default function ReturnLists() {
  const [date, setDate] = useState(dayjs().add(1, 'day'))
  const [slot, setSlot] = useState<number>()
  const ds = date.format('YYYY-MM-DD')
  const { data: slots } = useReturnSlotsQuery()
  const { data: avail } = useReturnAvailabilityQuery({ date: ds })
  const { data } = useReturnPassengersQuery({ date: ds, return_slot: slot })

  return (
    <Card
      title="كشوف ركاب العودة"
      extra={
        <Space wrap>
          <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />
          <Select placeholder="كل المواعيد" allowClear style={{ width: 150 }} value={slot} onChange={setSlot}
            options={(slots?.results || slots || []).map((s: any) => ({ value: s.id, label: s.name }))} />
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 16 }}>
        {(avail?.slots || []).map((s: any) => (
          <Tag key={s.id} color={s.full ? 'red' : 'blue'}>{s.name}: {s.used}/{s.capacity}</Tag>
        ))}
      </Space>
      {(data?.groups || []).length === 0 && <Empty description="لا يوجد ركاب" />}
      {(data?.groups || []).map((g: any) => (
        <div key={g.university} style={{ marginBottom: 16 }}>
          <Divider orientation="right" style={{ margin: '8px 0' }}>
            <Tag color="geekblue">{g.university}</Tag> {g.passengers.length} راكب
          </Divider>
          <Table
            size="small" rowKey="id" pagination={false} dataSource={g.passengers}
            columns={[
              { title: 'الطالب', dataIndex: 'student_name' },
              { title: 'الموعد', dataIndex: 'slot_name' },
              { title: 'الوقت', dataIndex: 'departure_time' },
            ]}
          />
        </div>
      ))}
    </Card>
  )
}

import { Card, Table, Tag, Button, Space, Segmented, Select, Modal, Input, App as AntdApp } from 'antd'
import { useState } from 'react'
import {
  useExpensesQuery, useApproveExpenseMutation, useRejectExpenseMutation, useVehicles2Query,
} from '../../app/api'

const KIND_COLOR: Record<string, string> = { fuel: 'blue', tolls: 'gold', other: 'purple' }
const STATUS_COLOR: Record<string, string> = { pending: 'orange', approved: 'green', rejected: 'red' }

export default function Expenses() {
  const { message } = AntdApp.useApp()
  const [status, setStatus] = useState('pending')
  const [vehicle, setVehicle] = useState<number>()
  const params: any = { vehicle }
  if (status !== 'all') params.status = status
  const { data, isFetching } = useExpensesQuery(params)
  const { data: vehicles } = useVehicles2Query({ active: true })
  const [approve] = useApproveExpenseMutation()
  const [reject] = useRejectExpenseMutation()
  const [rejectRow, setRejectRow] = useState<any>(null)
  const [reason, setReason] = useState('')

  const doReject = async () => {
    await reject({ id: rejectRow.id, rejection_reason: reason }).unwrap()
    message.success('تم رفض المصروف'); setRejectRow(null); setReason('')
  }

  return (
    <Card title={<span style={{ fontWeight: 800 }}>مراجعة مصروفات الرحلات</span>}
      extra={
        <Space wrap>
          <Select placeholder="كل المركبات" allowClear style={{ width: 180 }} value={vehicle} onChange={setVehicle}
            options={(vehicles?.results || []).map((v: any) => ({ value: v.id, label: v.plate_number }))} />
        </Space>
      }>
      <Segmented style={{ marginBottom: 16 }} value={status} onChange={(v) => setStatus(v as string)}
        options={[{ value: 'pending', label: 'بانتظار المراجعة' }, { value: 'approved', label: 'مقبولة' }, { value: 'rejected', label: 'مرفوضة' }, { value: 'all', label: 'الكل' }]} />
      <Table
        rowKey="id" loading={isFetching} dataSource={data?.results || []} scroll={{ x: 'max-content' }}
        columns={[
          { title: 'النوع', dataIndex: 'kind_display', render: (v, r: any) => <Tag color={KIND_COLOR[r.kind]}>{v}</Tag> },
          { title: 'المركبة', dataIndex: 'vehicle_plate' },
          { title: 'السائق', dataIndex: 'driver_name', render: (v) => v || '—' },
          { title: 'المبلغ', dataIndex: 'amount', render: (v) => `${Number(v).toLocaleString()} ج.م` },
          { title: 'الكمية', dataIndex: 'quantity', render: (v) => v ? `${v} لتر` : '—' },
          { title: 'التاريخ', dataIndex: 'date' },
          { title: 'الوصف', dataIndex: 'description', render: (v) => v || '—' },
          { title: 'الإيصال', dataIndex: 'receipt', render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">عرض</a> : '—' },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
          {
            title: 'إجراء', fixed: 'right', render: (_, r: any) => r.status === 'pending' ? (
              <Space>
                <Button size="small" type="primary" onClick={async () => { await approve(r.id).unwrap(); message.success('تم القبول') }}>قبول</Button>
                <Button size="small" danger onClick={() => setRejectRow(r)}>رفض</Button>
              </Space>
            ) : r.rejection_reason ? <span style={{ color: '#ef4444', fontSize: 12 }}>{r.rejection_reason}</span> : '—',
          },
        ]} />
      <Modal title="سبب رفض المصروف" open={!!rejectRow} onOk={doReject} onCancel={() => setRejectRow(null)} okText="رفض" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب الرفض" />
      </Modal>
    </Card>
  )
}

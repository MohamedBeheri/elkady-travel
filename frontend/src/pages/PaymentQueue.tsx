import { Card, Table, Tag, Button, Space, Image, Modal, Input, App as AntdApp } from 'antd'
import { useState } from 'react'
import { usePaymentQueueQuery, useApproveSubscriptionMutation, useRejectSubscriptionMutation } from '../app/api'

const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }

export default function PaymentQueue() {
  const { message, modal } = AntdApp.useApp()
  const { data, isFetching } = usePaymentQueueQuery()
  const [approve] = useApproveSubscriptionMutation()
  const [reject] = useRejectSubscriptionMutation()
  const [rejectRow, setRejectRow] = useState<any>(null)
  const [reason, setReason] = useState('')

  const doApprove = async (id: number) => {
    try {
      const res: any = await approve(id).unwrap()
      if (res?.seat_warning) {
        // Confirmed, but no seat could be assigned → the student has no ticket yet.
        modal.warning({ title: 'تم التأكيد — بدون مقعد', content: res.seat_warning, okText: 'فهمت' })
      } else {
        message.success('تم تأكيد الدفع والاشتراك')
      }
    } catch { message.error('خطأ') }
  }
  const doReject = async () => {
    try {
      await reject({ id: rejectRow.id, rejection_reason: reason }).unwrap()
      message.success('تم رفض الدفع'); setRejectRow(null); setReason('')
    } catch { message.error('خطأ') }
  }

  const rows = data?.results || data || []

  return (
    <Card title="طلبات تأكيد المدفوعات">
      <Table
        rowKey="id" loading={isFetching} dataSource={rows} scroll={{ x: 1000 }}
        columns={[
          { title: 'الطالب', dataIndex: 'student_name' },
          { title: 'الرقم القومي', dataIndex: 'student_national_id' },
          { title: 'الهاتف', dataIndex: 'student_phone' },
          { title: 'النوع', dataIndex: 'subscription_type', render: (v) => <Tag color="cyan">{TYPE_LABEL[v]}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'الجامعة', dataIndex: 'university_name' },
          { title: 'المبلغ', dataIndex: 'amount', render: (v) => `${Number(v).toLocaleString()} ج.م` },
          { title: 'الوسيلة', dataIndex: 'method_name' },
          { title: 'المرجع', dataIndex: 'payment_reference', render: (v) => v || '—' },
          {
            title: 'الإيصال', dataIndex: 'payment_proof',
            render: (v) => v ? <Image src={v} width={44} height={44} style={{ objectFit: 'cover', borderRadius: 6 }} /> : '—',
          },
          {
            title: 'إجراء', fixed: 'right', render: (_, r: any) => (
              <Space>
                <Button size="small" type="primary" onClick={() => doApprove(r.id)}>تأكيد</Button>
                <Button size="small" danger onClick={() => setRejectRow(r)}>رفض</Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="سبب رفض الدفع" open={!!rejectRow} onOk={doReject} onCancel={() => setRejectRow(null)} okText="رفض" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب الرفض ليظهر للطالب" />
      </Modal>
    </Card>
  )
}

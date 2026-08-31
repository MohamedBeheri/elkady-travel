import { Card, Table, Tag, Button, Modal, Select, Input, Upload, App as AntdApp, Descriptions, Alert } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import {
  useSubscriptionsQuery, usePaymentMethodsQuery, usePaymentAccountsQuery, useSubmitPaymentMutation,
} from '../app/api'

const STATUS_COLOR: Record<string, string> = {
  payment_pending: 'orange', payment_submitted: 'blue', under_review: 'blue',
  confirmed: 'green', rejected: 'red', cancelled: 'default', expired: 'default',
}
const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }

export default function MyBookings() {
  const { message } = AntdApp.useApp()
  const { data } = useSubscriptionsQuery()
  const { data: methods } = usePaymentMethodsQuery()
  const { data: accounts } = usePaymentAccountsQuery()
  const [submitPayment, { isLoading }] = useSubmitPaymentMutation()

  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<any>(null)
  const [methodId, setMethodId] = useState<number>()
  const [reference, setReference] = useState('')
  const [file, setFile] = useState<any>(null)

  const accountList = (accounts?.results || accounts || []).filter((a: any) => a.active !== false)
  const activeMethodIds = new Set(accountList.map((a: any) => a.method))
  const availableMethods = (methods?.results || methods || []).filter((m: any) => activeMethodIds.has(m.id))
  const openPay = (row: any) => {
    setCurrent(row); setReference(''); setFile(null); setOpen(true)
    setMethodId(availableMethods.length === 1 ? availableMethods[0].id : undefined)
  }
  const account = accountList.find((a: any) => a.method === methodId)

  useEffect(() => {
    if (open && !methodId && availableMethods.length === 1) setMethodId(availableMethods[0].id)
  }, [open, availableMethods.length, methodId])

  const submit = async () => {
    if (!methodId) { message.error('اختر وسيلة الدفع'); return }
    if (!file) { message.error('ارفع صورة إثبات الدفع'); return }
    const fd = new FormData()
    fd.append('payment_method', String(methodId))
    fd.append('payment_reference', reference)
    fd.append('payment_proof', file)
    try {
      await submitPayment({ id: current.id, body: fd }).unwrap()
      message.success('تم إرسال إثبات الدفع للمراجعة')
      setOpen(false)
    } catch {
      message.error('تعذر الإرسال')
    }
  }

  return (
    <Card title="حجوزاتي والمدفوعات">
      <Table
        rowKey="id"
        dataSource={data?.results || []}
        scroll={{ x: 700 }}
        columns={[
          { title: 'النوع', dataIndex: 'subscription_type', render: (v) => <Tag color="cyan">{TYPE_LABEL[v]}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'الجامعة', dataIndex: 'university_name' },
          { title: 'المبلغ', dataIndex: 'amount', render: (v) => `${Number(v).toLocaleString()} ج.م` },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
          {
            title: 'إجراء', render: (_, r: any) => (
              ['payment_pending', 'rejected'].includes(r.status)
                ? <Button size="small" type="primary" onClick={() => openPay(r)}>ادفع الآن</Button>
                : r.status === 'payment_submitted' ? <span style={{ color: '#64748b' }}>بانتظار المراجعة</span>
                : r.rejection_reason ? <span style={{ color: '#ef4444' }}>{r.rejection_reason}</span> : '—'
            ),
          },
        ]}
      />

      <Modal title="دفع الاشتراك" open={open} onOk={submit} confirmLoading={isLoading} onCancel={() => setOpen(false)} okText="إرسال إثبات الدفع">
        <Alert type="warning" style={{ marginBottom: 12 }}
          message="حوّل المبلغ إلى الحساب الظاهر ثم ارفع صورة الإيصال. لا يُعتمد الدفع إلا بعد مراجعة الإدارة." />
        <div style={{ marginBottom: 12 }}>وسيلة الدفع:</div>
        {availableMethods.length === 0
          ? <Alert type="error" showIcon style={{ marginBottom: 12 }} message="لم تُهيَّأ حسابات استلام بعد. تواصل مع الإدارة." />
          : <Select
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="اختر وسيلة الدفع" value={methodId} onChange={setMethodId}
              options={availableMethods.map((m: any) => ({ value: m.id, label: m.name }))}
            />}
        {account && (
          <>
            <Descriptions size="small" bordered column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="اسم الحساب">{account.holder_name}</Descriptions.Item>
              <Descriptions.Item label="الرقم">
                <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>{account.number}</span>
                {' '}
                <Button size="small" onClick={() => { navigator.clipboard?.writeText(account.number); message.success('تم النسخ') }}>نسخ</Button>
              </Descriptions.Item>
              {account.transfer_link && (
                <Descriptions.Item label="لينك التحويل">
                  <a href={account.transfer_link} target="_blank" rel="noreferrer">افتح رابط التحويل</a>
                </Descriptions.Item>
              )}
              {account.instructions && <Descriptions.Item label="تعليمات">{account.instructions}</Descriptions.Item>}
            </Descriptions>
            {account.qr_image && (
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>امسح الكود بتطبيق الدفع</div>
                <img src={account.qr_image} alt="qr"
                  style={{ maxWidth: 220, width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
              </div>
            )}
          </>
        )}
        <Input placeholder="مرجع التحويل (اختياري)" value={reference} onChange={(e) => setReference(e.target.value)} style={{ marginBottom: 12 }} />
        <Upload beforeUpload={(f) => { setFile(f); return false }} maxCount={1} fileList={file ? [file] : []} onRemove={() => setFile(null)}>
          <Button icon={<UploadOutlined />}>رفع صورة الإيصال</Button>
        </Upload>
      </Modal>
    </Card>
  )
}

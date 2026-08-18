import { Card, Table, Tag, Segmented, Button, Space, Modal, Form, InputNumber, Input, DatePicker, App as AntdApp, Descriptions } from 'antd'
import { useState } from 'react'
import {
  useTourismRequestsQuery, useCreateQuotationMutation, useSendQuotationMutation,
} from '../app/api'

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', quoted: 'blue', accepted: 'green', rejected: 'red', expired: 'default',
}
const TRIP_LABEL: Record<string, string> = { seat: 'فردي', private: 'خاصة' }

export default function TourismAdmin() {
  const { message } = AntdApp.useApp()
  const [status, setStatus] = useState('pending')
  const params: any = {}
  if (status !== 'all') params.status = status
  const { data, isFetching } = useTourismRequestsQuery(params)
  const [createQ] = useCreateQuotationMutation()
  const [sendQ] = useSendQuotationMutation()
  const [form] = Form.useForm()
  const [quoteFor, setQuoteFor] = useState<any>(null)
  const [detail, setDetail] = useState<any>(null)

  const submitQuote = async () => {
    const v = await form.validateFields()
    if (v.validity_date) v.validity_date = v.validity_date.format('YYYY-MM-DD')
    const q = await createQ({ ...v, request: quoteFor.id }).unwrap()
    await sendQ(q.id).unwrap()
    message.success('تم إنشاء العرض وإرساله للعميل')
    setQuoteFor(null); form.resetFields()
  }

  return (
    <Card title="السياحة والرحلات الخاصة">
      <Segmented
        style={{ marginBottom: 16 }} value={status} onChange={(v) => setStatus(v as string)}
        options={[
          { value: 'pending', label: 'طلبات جديدة' }, { value: 'quoted', label: 'عروض مرسلة' },
          { value: 'accepted', label: 'مقبولة' }, { value: 'rejected', label: 'مرفوضة' }, { value: 'all', label: 'الكل' },
        ]}
      />
      <Table
        rowKey="id" loading={isFetching} dataSource={data?.results || []} scroll={{ x: 900 }}
        columns={[
          { title: 'العميل', dataIndex: 'full_name' },
          { title: 'الهاتف', dataIndex: 'phone' },
          { title: 'من', dataIndex: 'origin' },
          { title: 'إلى', dataIndex: 'destination' },
          { title: 'التاريخ', dataIndex: 'travel_date' },
          { title: 'النوع', dataIndex: 'trip_type', render: (v) => <Tag>{TRIP_LABEL[v]}</Tag> },
          { title: 'مسافرون', dataIndex: 'travelers' },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
          {
            title: 'إجراء', fixed: 'right', render: (_, r: any) => (
              <Space>
                <Button size="small" onClick={() => setDetail(r)}>تفاصيل</Button>
                {r.status === 'pending' && <Button size="small" type="primary" onClick={() => { form.resetFields(); setQuoteFor(r) }}>عرض سعر</Button>}
              </Space>
            ),
          },
        ]}
      />

      <Modal title={`عرض سعر — ${quoteFor?.full_name || ''}`} open={!!quoteFor} onOk={submitQuote} onCancel={() => setQuoteFor(null)} okText="إنشاء وإرسال">
        <Form form={form} layout="vertical">
          <Form.Item name="price" label="السعر" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} addonAfter="ج.م" /></Form.Item>
          <Form.Item name="validity_date" label="صالح حتى"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="notes" label="ملاحظات / شروط"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="تفاصيل الطلب" open={!!detail} onCancel={() => setDetail(null)} footer={null}>
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="العميل">{detail.full_name}</Descriptions.Item>
            <Descriptions.Item label="الهاتف">{detail.phone}</Descriptions.Item>
            <Descriptions.Item label="الوجهة">{detail.origin} → {detail.destination}</Descriptions.Item>
            <Descriptions.Item label="التاريخ">{detail.travel_date}</Descriptions.Item>
            <Descriptions.Item label="المركبة">{detail.vehicle_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="عدد المسافرين">{detail.travelers}</Descriptions.Item>
            <Descriptions.Item label="ملاحظات">{detail.notes || '—'}</Descriptions.Item>
            {(detail.quotations || []).map((q: any) => (
              <Descriptions.Item key={q.id} label={`عرض (${q.status_display})`}>{Number(q.price).toLocaleString()} ج.م</Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Modal>
    </Card>
  )
}

import { Card, Form, Input, Select, DatePicker, InputNumber, Button, Table, Tag, App as AntdApp, Space } from 'antd'
import {
  useVehicleTypesQuery, useTourismRequestsQuery, useCreateTourismRequestMutation,
  useAcceptTourismMutation, useRejectTourismMutation,
} from '../app/api'
import { useAppSelector } from '../app/store'
import { phoneRule } from '../app/validators'

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange', quoted: 'blue', accepted: 'green', rejected: 'red', expired: 'default',
}

export default function TourismRequest() {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const user = useAppSelector((s) => s.auth.user)
  const { data: vehicles } = useVehicleTypesQuery()
  const { data: requests } = useTourismRequestsQuery()
  const [create, { isLoading }] = useCreateTourismRequestMutation()
  const [accept] = useAcceptTourismMutation()
  const [reject] = useRejectTourismMutation()

  const onFinish = async (values: any) => {
    try {
      await create({ ...values, travel_date: values.travel_date.format('YYYY-MM-DD') }).unwrap()
      message.success('تم إرسال طلبك. ستصلك التسعيرة بعد المراجعة.')
      form.resetFields()
    } catch {
      message.error('تعذر إرسال الطلب')
    }
  }

  return (
    <div>
      <Card title="طلب رحلة سياحية / خاصة" style={{ marginBottom: 20 }}>
        <Form form={form} layout="vertical" onFinish={onFinish}
          initialValues={{ full_name: user?.full_name, phone: user?.phone, national_id: user?.national_id, trip_type: 'private', travelers: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Form.Item name="full_name" label="الاسم" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="phone" label="الهاتف" rules={[{ required: true }, phoneRule]}><Input inputMode="numeric" maxLength={11} /></Form.Item>
            <Form.Item name="origin" label="من" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="destination" label="إلى" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="travel_date" label="تاريخ الرحلة" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="vehicle_type" label="نوع المركبة">
              <Select allowClear options={(vehicles?.results || vehicles || []).map((v: any) => ({ value: v.id, label: `${v.name} (${v.capacity})` }))} />
            </Form.Item>
            <Form.Item name="travelers" label="عدد المسافرين"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="trip_type" label="نوع الرحلة">
              <Select options={[{ value: 'seat', label: 'فردي / بالمقعد' }, { value: 'private', label: 'رحلة خاصة' }]} />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="ملاحظات"><Input.TextArea rows={2} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={isLoading}>إرسال الطلب</Button>
        </Form>
      </Card>

      <Card title="طلباتي وعروض الأسعار">
        <Table
          rowKey="id" scroll={{ x: 700 }}
          dataSource={requests?.results || []}
          columns={[
            { title: 'الوجهة', render: (_, r: any) => `${r.origin} → ${r.destination}` },
            { title: 'التاريخ', dataIndex: 'travel_date' },
            { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
            {
              title: 'عرض السعر', render: (_, r: any) => {
                const q = (r.quotations || []).find((x: any) => x.status === 'sent' || x.status === 'accepted')
                return q ? `${Number(q.price).toLocaleString()} ج.م` : '—'
              },
            },
            {
              title: 'إجراء', render: (_, r: any) => r.status === 'quoted' && (
                <Space>
                  <Button size="small" type="primary" onClick={async () => { await accept(r.id); message.success('تم القبول') }}>قبول</Button>
                  <Button size="small" danger onClick={async () => { await reject(r.id); message.success('تم الرفض') }}>رفض</Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

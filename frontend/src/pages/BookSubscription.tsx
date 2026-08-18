import { Card, Form, Select, Button, Statistic, App as AntdApp, Alert } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useRoutesQuery, usePricesQuery, useUniversitiesQuery, usePickupPointsQuery,
  useCreateSubscriptionMutation,
} from '../app/api'

const TYPES = [
  { value: 'term', label: 'اشتراك ترم' },
  { value: 'monthly', label: 'اشتراك شهري' },
  { value: 'daily', label: 'اشتراك يومي' },
]

export default function BookSubscription() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const [routeId, setRouteId] = useState<number>()
  const [type, setType] = useState<string>()

  const { data: routes } = useRoutesQuery({ active: true })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: pickups } = usePickupPointsQuery(routeId ? { route: routeId, active: true } : undefined, { skip: !routeId })
  const { data: prices } = usePricesQuery({ active: true })
  const [createSub, { isLoading }] = useCreateSubscriptionMutation()

  const price = prices?.results?.find((p: any) => p.route === routeId && p.subscription_type === type)?.price

  const selectedRoute = routes?.results?.find((r: any) => r.id === routeId)
  const destUnis = (unis?.results || []).filter((u: any) => !selectedRoute || u.destination === selectedRoute.destination)

  const onFinish = async (values: any) => {
    if (!price) { message.error('لا يوجد سعر متاح لهذا الاختيار'); return }
    try {
      await createSub({ ...values, amount: price }).unwrap()
      message.success('تم إنشاء الحجز — أكمل الدفع من صفحة حجوزاتي')
      navigate('/my-bookings')
    } catch {
      message.error('تعذر إنشاء الحجز')
    }
  }

  return (
    <Card title="حجز اشتراك نقل" style={{ maxWidth: 640 }}>
      <Alert type="info" style={{ marginBottom: 16 }}
        message="اختر نوع الاشتراك والمسار، ثم أكمل الدفع ورفع الإيصال. يتم تأكيد الاشتراك بعد مراجعة الإدارة." />
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="subscription_type" label="نوع الاشتراك" rules={[{ required: true }]}>
          <Select options={TYPES} onChange={setType} placeholder="اختر النوع" />
        </Form.Item>
        <Form.Item name="route" label="المسار" rules={[{ required: true }]}>
          <Select
            placeholder="اختر المسار"
            onChange={(v) => { setRouteId(v); form.setFieldsValue({ pickup_point: undefined, university: undefined }) }}
            options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
        <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
          <Select placeholder="اختر الجامعة" options={destUnis.map((u: any) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
        <Form.Item name="pickup_point" label="نقطة الالتقاط">
          <Select
            placeholder="اختر نقطة الالتقاط" allowClear
            options={(pickups?.results || []).map((p: any) => ({ value: p.id, label: `${p.sequence}. ${p.name}` }))}
          />
        </Form.Item>
        {price !== undefined && (
          <Statistic title="المبلغ المطلوب" value={Number(price)} suffix="ج.م" style={{ marginBottom: 16 }} />
        )}
        <Button type="primary" htmlType="submit" loading={isLoading}>تأكيد الحجز والانتقال للدفع</Button>
      </Form>
    </Card>
  )
}

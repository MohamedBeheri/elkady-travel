import { Card, Form, Input, Select, Button, App as AntdApp } from 'antd'
import { useEffect } from 'react'
import { useUpdateProfileMutation, useUniversitiesQuery } from '../app/api'
import { useAppDispatch, useAppSelector } from '../app/store'
import { setUser } from '../app/authSlice'

export default function Profile() {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const user = useAppSelector((s) => s.auth.user)
  const dispatch = useAppDispatch()
  const { data: unis } = useUniversitiesQuery({ active: true })
  const [update, { isLoading }] = useUpdateProfileMutation()

  useEffect(() => { form.setFieldsValue(user || {}) }, [user])

  const onFinish = async (values: any) => {
    try {
      const res = await update(values).unwrap()
      dispatch(setUser(res))
      message.success('تم حفظ البيانات')
    } catch {
      message.error('تعذر الحفظ')
    }
  }

  return (
    <Card title="ملفي الشخصي" style={{ maxWidth: 560 }}>
      <Form form={form} layout="vertical" onFinish={onFinish}>
        <Form.Item name="full_name" label="الاسم الكامل"><Input /></Form.Item>
        <Form.Item name="national_id" label="الرقم القومي"><Input /></Form.Item>
        <Form.Item name="phone" label="رقم الهاتف"><Input /></Form.Item>
        <Form.Item name="address" label="العنوان"><Input /></Form.Item>
        <Form.Item name="university" label="الجامعة">
          <Select options={(unis?.results || []).map((u: any) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={isLoading}>حفظ</Button>
      </Form>
    </Card>
  )
}

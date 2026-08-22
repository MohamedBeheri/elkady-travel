import { Button, Form, Input, Select, Typography, App as AntdApp } from 'antd'
import { useNavigate, Link } from 'react-router-dom'
import { useRegisterMutation, useLoginMutation, usePublicUniversitiesQuery } from '../app/api'
import { useAppDispatch } from '../app/store'
import { setCredentials } from '../app/authSlice'

export default function Register() {
  const [register, { isLoading }] = useRegisterMutation()
  const [login] = useLoginMutation()
  const { data: unis } = usePublicUniversitiesQuery()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const onFinish = async (values: any) => {
    try {
      await register(values).unwrap()
      const res = await login({ username: values.username, password: values.password }).unwrap()
      dispatch(setCredentials({ access: res.access, refresh: res.refresh, user: res.user }))
      message.success('تم إنشاء الحساب')
      navigate('/')
    } catch (e: any) {
      const detail = e?.data ? Object.values(e.data).flat().join('، ') : 'تعذر إنشاء الحساب'
      message.error(detail)
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-wrap" style={{ maxWidth: 560 }}>
        <img className="auth-banner" src="/hero-b3.png" alt="ELKADY TRAVEL" />
        <div className="auth-card">
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, color: '#0B2E5E' }}>حساب طالب جديد</Typography.Title>
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="full_name" label="الاسم الكامل" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="national_id" label="الرقم القومي" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="رقم الهاتف" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
            <Select
              placeholder="اختر الجامعة"
              options={(unis?.results || unis || []).map((u: any) => ({ value: u.id, label: u.name }))}
            />
          </Form.Item>
          <Form.Item name="address" label="العنوان">
            <Input />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="username" label="اسم المستخدم" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="كلمة المرور" rules={[{ required: true, min: 6 }]}>
              <Input.Password />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" block loading={isLoading}>إنشاء الحساب</Button>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16, color: '#64748b' }}>
          لديك حساب؟ <Link to="/login">تسجيل الدخول</Link>
        </div>
      </div>
      </div>
    </div>
  )
}

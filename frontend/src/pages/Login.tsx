import { Button, Form, Input, Typography, App as AntdApp } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { useLoginMutation } from '../app/api'
import { useAppDispatch } from '../app/store'
import { setCredentials } from '../app/authSlice'
import KaffoCredit from '../components/KaffoCredit'

export default function Login() {
  const [login, { isLoading }] = useLoginMutation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const onFinish = async (values: any) => {
    try {
      const res = await login(values).unwrap()
      dispatch(setCredentials({ access: res.access, refresh: res.refresh, user: res.user }))
      navigate('/')
    } catch {
      message.error('بيانات الدخول غير صحيحة')
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-wrap">
        <img className="auth-banner" src="/hero-b1.png" alt="ELKADY TRAVEL" />
        <div className="auth-card">
          <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, color: '#0B2E5E' }}>تسجيل الدخول</Typography.Title>
          <Typography.Paragraph style={{ textAlign: 'center', color: '#64748b', marginBottom: 20 }}>ادخل إلى حسابك لمتابعة رحلاتك</Typography.Paragraph>
          <Form layout="vertical" onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: 'أدخل اسم المستخدم' }]}>
              <Input prefix={<UserOutlined />} placeholder="اسم المستخدم" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'أدخل كلمة المرور' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="كلمة المرور" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading} style={{ height: 48, fontSize: 16 }}>دخول إلى رحلاتي</Button>
          </Form>
          <div style={{ textAlign: 'center', marginTop: 18, color: '#64748b' }}>
            طالب جديد؟ <Link to="/register" style={{ fontWeight: 700 }}>أنشئ حساباً</Link>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Link to="/explore" style={{ color: '#F07E1B', fontWeight: 700 }}>تصفّح الخطوط والمواعيد والأسعار ←</Link>
          </div>
          <KaffoCredit style={{ marginTop: 18 }} />
        </div>
      </div>
    </div>
  )
}

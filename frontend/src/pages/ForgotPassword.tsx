import { Button, DatePicker, Form, Input, Select, Typography, Alert, App as AntdApp } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  usePublicUniversitiesQuery, usePublicCollegesQuery, usePublicPickupPointsQuery,
  useResetStudentPasswordMutation,
} from '../app/api'
import { phoneRule, dedupePickups } from '../app/validators'
import KaffoCredit from '../components/KaffoCredit'

const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' },
  { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' },
  { value: 'benha', label: 'بنها' },
]

export default function ForgotPassword() {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()
  const [uniId, setUniId] = useState<number>()
  const [center, setCenter] = useState<string>()
  const { data: unis } = usePublicUniversitiesQuery()
  const { data: colleges } = usePublicCollegesQuery(uniId, { skip: !uniId })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const [reset, { isLoading }] = useResetStudentPasswordMutation()
  const [serverError, setServerError] = useState<string>('')

  const onFinish = async (v: any) => {
    setServerError('')
    try {
      const payload = {
        email: v.email,
        phone: v.phone,
        date_of_birth: v.date_of_birth?.format('YYYY-MM-DD'),
        university: v.university,
        college: v.college,
        pickup_point: v.pickup_point,
        new_password: v.new_password,
        new_password_confirm: v.new_password_confirm,
      }
      const res = await reset(payload).unwrap()
      message.success(res.detail || 'تم تغيير كلمة السر')
      navigate('/login')
    } catch (e: any) {
      setServerError(e?.data?.detail || 'تعذّر إعادة تعيين كلمة السر')
    }
  }

  return (
    <div className="auth-bg">
      <div className="auth-wrap" style={{ maxWidth: 560 }}>
        <img className="auth-banner" src="/hero-b2.png" alt="ELKADY TRAVEL" />
        <div className="auth-card">
          <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, color: '#0B2E5E' }}>
            استرجاع كلمة السر
          </Typography.Title>
          <Typography.Paragraph style={{ textAlign: 'center', color: '#64748b', marginBottom: 18 }}>
            أدخل نفس البيانات التي سجلت بها لتغيير كلمة السر
          </Typography.Paragraph>

          {serverError && <Alert type="error" showIcon message={serverError} style={{ marginBottom: 14 }} />}

          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="email" label="البريد الإلكتروني"
              rules={[{ required: true, message: 'أدخل البريد الإلكتروني' }, { type: 'email', message: 'بريد إلكتروني غير صحيح' }]}>
              <Input inputMode="email" placeholder="example@mail.com" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="phone" label="رقم الموبايل" rules={[{ required: true }, phoneRule]}>
                <Input inputMode="numeric" maxLength={11} placeholder="١١ رقم" />
              </Form.Item>
              <Form.Item name="date_of_birth" label="تاريخ الميلاد" rules={[{ required: true, message: 'اختر التاريخ' }]}>
                <DatePicker style={{ width: '100%' }} placeholder="اختر التاريخ" />
              </Form.Item>
            </div>
            <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
              <Select placeholder="اختر الجامعة"
                onChange={(v) => { setUniId(v); form.setFieldsValue({ college: undefined }) }}
                options={(unis?.results || unis || []).map((u: any) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
            <Form.Item name="college" label="الكلية" rules={[{ required: true }]}>
              <Select placeholder={uniId ? 'اختر الكلية' : 'اختر الجامعة أولاً'} disabled={!uniId}
                options={(colleges || []).map((c: any) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item label="نقطة الالتقاط بالمركز" required style={{ marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="center" rules={[{ required: true, message: 'اختر المركز' }]}>
                  <Select placeholder="المركز"
                    onChange={(v) => { setCenter(v); form.setFieldsValue({ pickup_point: undefined }) }}
                    options={CENTERS} />
                </Form.Item>
                <Form.Item name="pickup_point" rules={[{ required: true, message: 'اختر نقطة الالتقاط' }]}>
                  <Select placeholder={center ? 'نقطة الالتقاط' : 'اختر المركز أولاً'} disabled={!center}
                    showSearch optionFilterProp="label"
                    options={dedupePickups(pickups || []).map((p: any) => ({ value: p.id, label: p.name }))} />
                </Form.Item>
              </div>
            </Form.Item>

            <div style={{ borderTop: '1px dashed #e5e7eb', margin: '10px 0 14px' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="new_password" label="كلمة السر الجديدة"
                rules={[{ required: true, min: 6, message: '٦ أحرف على الأقل' }]}>
                <Input.Password />
              </Form.Item>
              <Form.Item name="new_password_confirm" label="تأكيد كلمة السر" dependencies={['new_password']}
                rules={[
                  { required: true, message: 'أعد كتابة كلمة السر' },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      !value || getFieldValue('new_password') === value
                        ? Promise.resolve()
                        : Promise.reject(new Error('كلمة السر وتأكيدها غير متطابقين')),
                  }),
                ]}>
                <Input.Password />
              </Form.Item>
            </div>

            <Button type="primary" htmlType="submit" block loading={isLoading} style={{ height: 46, fontSize: 16 }}>
              تغيير كلمة السر
            </Button>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 14, color: '#64748b' }}>
            تذكرت كلمة السر؟ <Link to="/login" style={{ fontWeight: 700 }}>عد لتسجيل الدخول</Link>
          </div>
          <KaffoCredit style={{ marginTop: 16 }} />
        </div>
      </div>
    </div>
  )
}

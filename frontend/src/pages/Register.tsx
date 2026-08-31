import { Button, Form, Input, Select, DatePicker, Typography, App as AntdApp } from 'antd'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useRegisterMutation, useLoginMutation, usePublicUniversitiesQuery, usePublicCollegesQuery, usePublicPickupPointsQuery } from '../app/api'
import { useAppDispatch } from '../app/store'
import { setCredentials } from '../app/authSlice'

const YEARS = [
  { value: '1', label: 'الفرقة الأولى' },
  { value: '2', label: 'الفرقة الثانية' },
  { value: '3', label: 'الفرقة الثالثة' },
  { value: '4', label: 'الفرقة الرابعة' },
  { value: '5', label: 'الفرقة الخامسة' },
]
const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' },
  { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' },
  { value: 'benha', label: 'بنها' },
]

export default function Register() {
  const [form] = Form.useForm()
  const [register, { isLoading }] = useRegisterMutation()
  const [login] = useLoginMutation()
  const [uniId, setUniId] = useState<number>()
  const [center, setCenter] = useState<string>()
  const { data: unis } = usePublicUniversitiesQuery()
  const { data: colleges } = usePublicCollegesQuery(uniId, { skip: !uniId })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()

  const onFinish = async (values: any) => {
    try {
      const payload = { ...values, date_of_birth: values.date_of_birth?.format('YYYY-MM-DD') }
      await register(payload).unwrap()
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
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="full_name" label="الاسم الكامل" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="phone" label="رقم الهاتف" rules={[{ required: true }]}>
                <Input inputMode="tel" />
              </Form.Item>
              <Form.Item name="date_of_birth" label="تاريخ الميلاد" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} placeholder="اختر التاريخ" />
              </Form.Item>
            </div>
            <Form.Item name="gender" label="النوع" rules={[{ required: true }]}>
              <Select placeholder="النوع" options={[{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }]} />
            </Form.Item>
            <Form.Item name="university" label="الجامعة" rules={[{ required: true }]}>
              <Select placeholder="اختر الجامعة"
                onChange={(v) => { setUniId(v); form.setFieldsValue({ college: undefined }) }}
                options={(unis?.results || unis || []).map((u: any) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
            <Form.Item name="college" label="الكلية" rules={[{ required: true }]}>
              <Select placeholder={uniId ? 'اختر الكلية' : 'اختر الجامعة أولاً'} disabled={!uniId}
                options={(colleges || []).map((c: any) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="academic_year" label="الفرقة الدراسية" rules={[{ required: true }]}>
              <Select placeholder="اختر الفرقة" options={YEARS} />
            </Form.Item>
            <Form.Item name="center" label="المركز التابع له" rules={[{ required: true }]}>
              <Select placeholder="اختر المركز"
                onChange={(v) => { setCenter(v); form.setFieldsValue({ pickup_point: undefined }) }}
                options={CENTERS} />
            </Form.Item>
            <Form.Item name="pickup_point" label="نقطة الالتقاط" rules={[{ required: true }]}>
              <Select placeholder={center ? 'اختر نقطة الالتقاط' : 'اختر المركز أولاً'} disabled={!center}
                showSearch optionFilterProp="label"
                options={(pickups || []).map((p: any) => ({ value: p.id, label: p.name }))} />
            </Form.Item>
            <Form.Item name="address" label="تفاصيل إضافية (اختياري)">
              <Input.TextArea rows={2} placeholder="أقرب علامة مميزة…" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="username" label="اسم المستخدم" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="كلمة المرور" rules={[{ required: true, min: 6 }]}>
                <Input.Password />
              </Form.Item>
            </div>
            <Button type="primary" htmlType="submit" block loading={isLoading} style={{ height: 46, fontSize: 16 }}>إنشاء الحساب</Button>
          </Form>
          <div style={{ textAlign: 'center', marginTop: 16, color: '#64748b' }}>
            لديك حساب؟ <Link to="/login" style={{ fontWeight: 700 }}>تسجيل الدخول</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

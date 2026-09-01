import { Alert, Button, DatePicker, Form, Input, Select, Steps, Typography, App as AntdApp } from 'antd'
import { CheckCircleTwoTone } from '@ant-design/icons'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  usePublicUniversitiesQuery, usePublicCollegesQuery, usePublicPickupPointsQuery,
  usePasswordResetLookupMutation, useResetStudentPasswordMutation,
} from '../app/api'
import { phoneRule, dedupePickups } from '../app/validators'
import KaffoCredit from '../components/KaffoCredit'

const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' },
  { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' },
  { value: 'benha', label: 'بنها' },
]

type LookupResult = { found: true; has_email: boolean; has_phone: boolean } | null

export default function ForgotPassword() {
  const [step, setStep] = useState<0 | 1>(0)
  const [identifier, setIdentifier] = useState('')
  const [identifierKind, setIdentifierKind] = useState<'email' | 'phone'>('email')
  const [lookupInfo, setLookupInfo] = useState<LookupResult>(null)
  const [serverError, setServerError] = useState('')

  const [lookupForm] = Form.useForm()
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const navigate = useNavigate()

  const [uniId, setUniId] = useState<number>()
  const [center, setCenter] = useState<string>()
  const { data: unis } = usePublicUniversitiesQuery()
  const { data: colleges } = usePublicCollegesQuery(uniId, { skip: !uniId })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })

  const [lookup, { isLoading: lookingUp }] = usePasswordResetLookupMutation()
  const [reset, { isLoading: submitting }] = useResetStudentPasswordMutation()

  const onLookup = async (v: any) => {
    setServerError('')
    const id = String(v.identifier || '').trim()
    if (!id) return
    const kind: 'email' | 'phone' = id.includes('@') ? 'email' : 'phone'
    try {
      const res = await lookup({ identifier: id }).unwrap()
      setLookupInfo(res)
      setIdentifier(id)
      setIdentifierKind(kind)
      // Pre-fill the identifier field in step 2 and lock it.
      form.setFieldsValue(kind === 'email' ? { email: id } : { phone: id })
      setStep(1)
    } catch (e: any) {
      setLookupInfo(null)
      setServerError(e?.data?.detail || 'لم يتم العثور على الحساب.')
    }
  }

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

  const backToStep1 = () => {
    setStep(0)
    setLookupInfo(null)
    setServerError('')
  }

  return (
    <div className="auth-bg">
      <div className="auth-wrap" style={{ maxWidth: 560 }}>
        <img className="auth-banner" src="/hero-b2.png" alt="ELKADY TRAVEL" />
        <div className="auth-card">
          <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, color: '#0B2E5E' }}>
            استرجاع كلمة السر
          </Typography.Title>

          <Steps
            size="small" current={step} style={{ marginBottom: 18 }}
            items={[{ title: 'التحقق من الحساب' }, { title: 'الأسئلة الأمنية وتغيير كلمة السر' }]}
          />

          {serverError && <Alert type="error" showIcon message={serverError} style={{ marginBottom: 14 }} />}

          {step === 0 && (
            <Form form={lookupForm} layout="vertical" onFinish={onLookup}>
              <Typography.Paragraph style={{ color: '#64748b', marginBottom: 12 }}>
                أدخل البريد الإلكتروني أو رقم الموبايل المسجل به الحساب:
              </Typography.Paragraph>
              <Form.Item name="identifier" label="البريد الإلكتروني أو رقم الموبايل"
                rules={[{ required: true, message: 'أدخل البريد أو رقم الموبايل' }]}>
                <Input placeholder="example@mail.com أو 01xxxxxxxxx" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={lookingUp} style={{ height: 46, fontSize: 16 }}>
                التحقق ومتابعة
              </Button>
            </Form>
          )}

          {step === 1 && lookupInfo && (
            <>
              <Alert
                type="success" showIcon icon={<CheckCircleTwoTone twoToneColor="#059669" />}
                message={`تم العثور على الحساب المسجل بـ «${identifier}». أكمل باقي بياناتك لتغيير كلمة السر.`}
                style={{ marginBottom: 14 }}
              />

              <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item name="email" label="البريد الإلكتروني"
                  rules={[{ required: true, message: 'أدخل البريد الإلكتروني' }, { type: 'email', message: 'بريد إلكتروني غير صحيح' }]}>
                  <Input inputMode="email" disabled={identifierKind === 'email'} />
                </Form.Item>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item name="phone" label="رقم الموبايل" rules={[{ required: true }, phoneRule]}>
                    <Input inputMode="numeric" maxLength={11} placeholder="١١ رقم" disabled={identifierKind === 'phone'} />
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

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button onClick={backToStep1}>رجوع</Button>
                  <Button type="primary" htmlType="submit" block loading={submitting} style={{ height: 46, fontSize: 16 }}>
                    تغيير كلمة السر
                  </Button>
                </div>
              </Form>
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: 14, color: '#64748b' }}>
            تذكرت كلمة السر؟ <Link to="/login" style={{ fontWeight: 700 }}>عد لتسجيل الدخول</Link>
          </div>
          <KaffoCredit style={{ marginTop: 16 }} />
        </div>
      </div>
    </div>
  )
}

import { Card, Descriptions, Table, Tag, Avatar, Row, Col, Button, Modal, Form, Input, Select, DatePicker, App as AntdApp } from 'antd'
import { UserOutlined, EditOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useUpdateProfileMutation, usePublicUniversitiesQuery, usePublicCollegesQuery, usePublicPickupPointsQuery, useSubscriptionsQuery,
} from '../app/api'
import { useAppDispatch, useAppSelector } from '../app/store'
import { setUser } from '../app/authSlice'
import { phoneRule } from '../app/validators'

const STATUS_COLOR: Record<string, string> = {
  payment_pending: 'orange', payment_submitted: 'blue', under_review: 'blue',
  confirmed: 'green', rejected: 'red', cancelled: 'default', expired: 'default',
}
const TYPE_LABEL: Record<string, string> = { term: 'ترم', monthly: 'شهري', daily: 'يومي' }

export default function Profile() {
  const [form] = Form.useForm()
  const { message } = AntdApp.useApp()
  const user = useAppSelector((s) => s.auth.user)
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const [uniId, setUniId] = useState<number | undefined>(user?.university || undefined)
  const [center, setCenter] = useState<string | undefined>(user?.center || undefined)
  const { data: unis } = usePublicUniversitiesQuery()
  const { data: colleges } = usePublicCollegesQuery(uniId, { skip: !uniId })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  const { data: subs } = useSubscriptionsQuery()
  const [update, { isLoading }] = useUpdateProfileMutation()

  const openEdit = () => {
    setUniId(user?.university || undefined)
    setCenter(user?.center || undefined)
    form.setFieldsValue({
      ...user,
      date_of_birth: user?.date_of_birth ? dayjs(user.date_of_birth) : undefined,
    })
    setOpen(true)
  }
  const onFinish = async (v: any) => {
    try {
      const res = await update({ ...v, date_of_birth: v.date_of_birth?.format('YYYY-MM-DD') }).unwrap()
      dispatch(setUser(res)); message.success('تم حفظ البيانات'); setOpen(false)
    } catch { message.error('تعذر الحفظ') }
  }

  const active = (subs?.results || []).filter((s: any) => s.status === 'confirmed')
  const past = (subs?.results || []).filter((s: any) => s.status !== 'confirmed')

  return (
    <div>
      <Card style={{ marginBottom: 18, background: 'linear-gradient(120deg,#0B2E5E,#123a73 60%,#EC6A16)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar size={72} icon={<UserOutlined />} style={{ background: '#fff', color: '#0B2E5E' }} />
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{user?.full_name}</div>
            <div style={{ opacity: 0.9 }}>{user?.university_name} {user?.college_name ? `— ${user.college_name}` : ''}</div>
            <div style={{ marginTop: 6 }}>
              {user?.year_display && <Tag color="gold">{user.year_display}</Tag>}
              {user?.gender_display && <Tag color={user.gender === 'female' ? 'magenta' : 'blue'}>{user.gender_display}</Tag>}
            </div>
          </div>
          <Button icon={<EditOutlined />} onClick={openEdit} style={{ marginInlineStart: 'auto' }}>تعديل</Button>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Card title={<span style={{ fontWeight: 800 }}>البيانات الشخصية</span>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="الاسم">{user?.full_name}</Descriptions.Item>
              <Descriptions.Item label="الهاتف">{user?.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="تاريخ الميلاد">{user?.date_of_birth || '—'}</Descriptions.Item>
              <Descriptions.Item label="النوع">{user?.gender_display || '—'}</Descriptions.Item>
              <Descriptions.Item label="الجامعة">{user?.university_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="الكلية">{user?.college_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="الفرقة">{user?.year_display || '—'}</Descriptions.Item>
              <Descriptions.Item label="المركز">{user?.center_display || '—'}</Descriptions.Item>
              <Descriptions.Item label="نقطة الالتقاط">{user?.pickup_name || '—'}</Descriptions.Item>
              <Descriptions.Item label="تفاصيل إضافية">{user?.address || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card title={<span style={{ fontWeight: 800 }}>اشتراكاتي الحالية</span>} style={{ marginBottom: 16 }}>
            <Table rowKey="id" size="small" pagination={false} dataSource={active}
              locale={{ emptyText: 'لا توجد اشتراكات نشطة' }}
              columns={[
                { title: 'النوع', dataIndex: 'subscription_type', render: (v) => <Tag color="cyan">{TYPE_LABEL[v]}</Tag> },
                { title: 'المسار', dataIndex: 'route_name' },
                { title: 'المبلغ', dataIndex: 'amount', render: (v) => `${Number(v).toLocaleString()} ج.م` },
                { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
              ]} />
          </Card>
          <Card title={<span style={{ fontWeight: 800 }}>سجل الاشتراكات السابقة</span>}>
            <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={past}
              locale={{ emptyText: 'لا يوجد سجل' }}
              columns={[
                { title: 'النوع', dataIndex: 'subscription_type', render: (v) => <Tag>{TYPE_LABEL[v]}</Tag> },
                { title: 'المسار', dataIndex: 'route_name' },
                { title: 'التاريخ', dataIndex: 'created_at', render: (v) => v ? new Date(v).toLocaleDateString('ar-EG') : '—' },
                { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
              ]} />
          </Card>
        </Col>
      </Row>

      <Modal title="تعديل البيانات" open={open} onOk={() => form.submit()} confirmLoading={isLoading} onCancel={() => setOpen(false)} okText="حفظ">
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="full_name" label="الاسم الكامل"><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="phone" label="الهاتف" rules={[phoneRule]}><Input inputMode="numeric" maxLength={11} /></Form.Item>
            <Form.Item name="date_of_birth" label="تاريخ الميلاد"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="gender" label="النوع">
              <Select options={[{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }]} />
            </Form.Item>
            <Form.Item name="academic_year" label="الفرقة">
              <Select options={[1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: `الفرقة ${['','الأولى','الثانية','الثالثة','الرابعة','الخامسة'][y]}` }))} />
            </Form.Item>
          </div>
          <Form.Item name="university" label="الجامعة">
            <Select onChange={(v) => { setUniId(v); form.setFieldsValue({ college: undefined }) }}
              options={(unis?.results || unis || []).map((u: any) => ({ value: u.id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="college" label="الكلية">
            <Select disabled={!uniId} options={(colleges || []).map((c: any) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="center" label="المركز التابع له">
            <Select onChange={(v) => { setCenter(v); form.setFieldsValue({ pickup_point: undefined }) }}
              options={[{ value: 'shebin', label: 'شبين الكوم' }, { value: 'quesna', label: 'قويسنا' }, { value: 'bagour', label: 'الباجور' }, { value: 'benha', label: 'بنها' }]} />
          </Form.Item>
          <Form.Item name="pickup_point" label="نقطة الالتقاط">
            <Select placeholder={center ? 'اختر نقطة الالتقاط' : 'اختر المركز أولاً'} disabled={!center}
              showSearch optionFilterProp="label"
              options={(pickups || []).map((p: any) => ({ value: p.id, label: p.name }))} />
          </Form.Item>
          <Form.Item name="address" label="تفاصيل إضافية"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

import {
  Modal, Tabs, Descriptions, Table, Tag, Space, Empty, Image, Button,
  Form, Input, Select, DatePicker, App as AntdApp,
} from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useStudentFullProfileQuery, useUniversitiesQuery, useCollegesQuery,
  usePublicPickupPointsQuery, useSaveUserMutation,
} from '../app/api'
import { phoneRule, dedupePickups } from '../app/validators'

export const STATUS_COLOR: Record<string, string> = {
  payment_pending: 'orange', payment_submitted: 'blue', under_review: 'blue',
  confirmed: 'green', rejected: 'red', cancelled: 'default', expired: 'default',
}
const CENTERS = [
  { value: 'shebin', label: 'شبين الكوم' }, { value: 'quesna', label: 'قويسنا' },
  { value: 'bagour', label: 'الباجور' }, { value: 'benha', label: 'بنها' },
]
const YEARS = [
  { value: '1', label: 'الفرقة الأولى' }, { value: '2', label: 'الفرقة الثانية' },
  { value: '3', label: 'الفرقة الثالثة' }, { value: '4', label: 'الفرقة الرابعة' },
  { value: '5', label: 'الفرقة الخامسة' },
]

/* ---------- Student profile: info + subscriptions/payments + trip history ---------- */
export function TripsTable(rows: any[], emptyText: string) {
  if (!rows.length) return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  return (
    <Table
      size="small" rowKey={(r: any, i: any) => `${r.date}-${r.route}-${r.direction}-${i}`}
      pagination={false} dataSource={rows} scroll={{ x: 750 }}
      columns={[
        { title: 'التاريخ', dataIndex: 'date', render: (v: string, r: any) => (
          <span>{v}{r.rescheduled && <Tag color="gold" style={{ marginInlineStart: 6 }}>مؤجل</Tag>}</span>
        ) },
        { title: 'المسار', dataIndex: 'route' },
        { title: 'الاتجاه', dataIndex: 'direction' },
        { title: 'الموعد', dataIndex: 'slot' },
        { title: 'النوع', dataIndex: 'kind', render: (v: string) => <Tag color="cyan">{v}</Tag> },
        { title: 'الحالة', dataIndex: 'status_display', render: (v: string, r: any) => <Tag color={STATUS_COLOR[r.status] || 'default'}>{v}</Tag> },
        { title: 'تاريخ تأكيد الذهاب', dataIndex: 'confirmed_at', render: (v: string) => v || '—' },
      ]}
    />
  )
}

export function StudentProfileModal({ studentId, onClose }: { studentId: number | null; onClose: () => void }) {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm()
  const [editing, setEditing] = useState(false)
  const [editUni, setEditUni] = useState<number>()
  const [editCenter, setEditCenter] = useState<string>()
  const { data: profile, isFetching } = useStudentFullProfileQuery(studentId as number, { skip: !studentId })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: colleges } = useCollegesQuery({ university: editUni }, { skip: !editUni })
  const { data: pickups } = usePublicPickupPointsQuery(editCenter, { skip: !editCenter })
  const [saveUser, { isLoading }] = useSaveUserMutation()

  const student = profile?.student

  const startEdit = () => {
    if (!student) return
    setEditUni(student.university); setEditCenter(student.center)
    form.setFieldsValue({
      ...student,
      date_of_birth: student.date_of_birth ? dayjs(student.date_of_birth) : undefined,
    })
    setEditing(true)
  }

  const save = async () => {
    const v = await form.validateFields()
    try {
      await saveUser({ id: studentId, ...v, date_of_birth: v.date_of_birth?.format('YYYY-MM-DD') }).unwrap()
      message.success('تم حفظ بيانات الطالب'); setEditing(false)
    } catch { message.error('تعذر الحفظ') }
  }

  const tabItems = student ? [
    {
      key: 'info', label: 'البيانات الشخصية',
      children: editing ? (
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="full_name" label="الاسم الكامل" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="phone" label="الهاتف" rules={[phoneRule]}><Input inputMode="numeric" maxLength={11} /></Form.Item>
            <Form.Item name="date_of_birth" label="تاريخ الميلاد"><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="gender" label="النوع">
              <Select options={[{ value: 'male', label: 'ذكر' }, { value: 'female', label: 'أنثى' }]} />
            </Form.Item>
            <Form.Item name="university" label="الجامعة">
              <Select onChange={(v) => { setEditUni(v); form.setFieldsValue({ college: undefined }) }}
                options={(unis?.results || []).map((u: any) => ({ value: u.id, label: u.name }))} />
            </Form.Item>
            <Form.Item name="college" label="الكلية">
              <Select disabled={!editUni} options={(colleges?.results || colleges || []).map((c: any) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="academic_year" label="الفرقة"><Select options={YEARS} /></Form.Item>
            <Form.Item name="center" label="المركز">
              <Select onChange={(v) => { setEditCenter(v); form.setFieldsValue({ pickup_point: undefined }) }} options={CENTERS} />
            </Form.Item>
            <Form.Item name="pickup_point" label="نقطة الالتقاط">
              <Select disabled={!editCenter} showSearch optionFilterProp="label"
                options={dedupePickups(pickups || []).map((p: any) => ({ value: p.id, label: p.name }))} />
            </Form.Item>
          </div>
          <Form.Item name="address" label="تفاصيل إضافية"><Input.TextArea rows={2} /></Form.Item>
          <Space>
            <Button onClick={() => setEditing(false)}>إلغاء</Button>
            <Button type="primary" loading={isLoading} onClick={save}>حفظ</Button>
          </Space>
        </Form>
      ) : (
        <>
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="الاسم">{student.full_name}</Descriptions.Item>
            <Descriptions.Item label="اسم المستخدم">{student.username}</Descriptions.Item>
            <Descriptions.Item label="الهاتف">{student.phone || '—'}</Descriptions.Item>
            <Descriptions.Item label="تاريخ الميلاد">{student.date_of_birth || '—'}</Descriptions.Item>
            <Descriptions.Item label="النوع">{student.gender_display || '—'}</Descriptions.Item>
            <Descriptions.Item label="الجامعة">{student.university_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="الكلية">{student.college_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="الفرقة">{student.year_display || '—'}</Descriptions.Item>
            <Descriptions.Item label="المركز">{student.center_display || '—'}</Descriptions.Item>
            <Descriptions.Item label="نقطة الالتقاط">{student.pickup_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="تفاصيل إضافية">{student.address || '—'}</Descriptions.Item>
          </Descriptions>
          <Button icon={<EditOutlined />} onClick={startEdit}>تعديل البيانات</Button>
        </>
      ),
    },
    {
      key: 'subs', label: `الاشتراكات والمدفوعات (${profile.subscriptions.length})`,
      children: !profile.subscriptions.length ? <Empty description="لا توجد اشتراكات" /> : (
        <Table
          size="small" rowKey="id" pagination={false} dataSource={profile.subscriptions} scroll={{ x: 700 }}
          columns={[
            { title: 'النوع', dataIndex: 'type_display', render: (v: string) => <Tag color="cyan" style={{ whiteSpace: 'normal' }}>{v}</Tag> },
            { title: 'المسار', dataIndex: 'route_name' },
            { title: 'المبلغ', dataIndex: 'amount', render: (v: any) => `${Number(v).toLocaleString()} ج.م` },
            { title: 'الحالة', dataIndex: 'status_display', render: (v: string, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
            { title: 'الوسيلة', dataIndex: 'method_name', render: (v: string) => v || '—' },
            { title: 'المرجع', dataIndex: 'payment_reference', render: (v: string) => v || '—' },
            {
              title: 'إثبات الدفع', dataIndex: 'payment_proof',
              render: (v: string) => v
                ? <Image src={v} width={44} height={44} style={{ objectFit: 'cover', borderRadius: 6 }} />
                : '—',
            },
          ]}
        />
      ),
    },
    {
      key: 'upcoming', label: `الرحلات القادمة (${profile.upcoming_trips.length})`,
      children: (
        <div>
          {profile.standing_seats.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#475569' }}>مقاعد ثابتة (ترم/شهري):</div>
              <Space wrap>
                {profile.standing_seats.map((s: any, i: number) => (
                  <Tag key={i} color="green">{s.route} — {s.direction} — {s.slot}</Tag>
                ))}
              </Space>
            </div>
          )}
          {TripsTable(profile.upcoming_trips, 'لا توجد رحلات قادمة مسجّلة')}
        </div>
      ),
    },
    {
      key: 'past', label: `الرحلات السابقة (${profile.past_trips.length})`,
      children: (
        <div>
          {TripsTable(profile.past_trips, 'لا توجد رحلات سابقة')}
          {profile.declared_absences.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#475569' }}>أيام غياب معلنة (آخر 20):</div>
              <Space wrap>
                {profile.declared_absences.map((a: any, i: number) => (
                  <Tag key={i} color="red">{a.date} — {a.route} ({a.direction})</Tag>
                ))}
              </Space>
            </div>
          )}
        </div>
      ),
    },
  ] : []

  return (
    <Modal open={!!studentId} onCancel={() => { setEditing(false); onClose() }} width={900}
      title={student ? `ملف الطالب — ${student.full_name || student.username}` : 'ملف الطالب'}
      footer={[<Button key="x" onClick={() => { setEditing(false); onClose() }}>إغلاق</Button>]}>
      {isFetching && !student ? 'جارٍ التحميل…' : <Tabs items={tabItems} />}
    </Modal>
  )
}

/** Clickable student name — opens their full profile in a popup, usable anywhere a student_id is available. */
export function StudentLink({ id, name }: { id?: number | null; name: string }) {
  const [open, setOpen] = useState(false)
  if (!id) return <>{name}</>
  return (
    <>
      <a onClick={() => setOpen(true)}>{name}</a>
      {open && <StudentProfileModal studentId={id} onClose={() => setOpen(false)} />}
    </>
  )
}

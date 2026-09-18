import {
  Card, Table, Tag, Segmented, Select, Space, Button, Modal, Descriptions,
  Form, Input, DatePicker, App as AntdApp, Tooltip,
} from 'antd'
import {
  WhatsAppOutlined, EyeOutlined, FileExcelOutlined, FilePdfOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useSubscriptionsQuery, useDeleteSubscriptionMutation, useRoutesQuery, useUniversitiesQuery, useUsersQuery,
  useSaveUserMutation, useCollegesQuery, usePublicPickupPointsQuery,
  useMarkSubscriptionNotifiedMutation, useClearSubscriptionNotifiedMutation,
} from '../app/api'
import { phoneRule, dedupePickups } from '../app/validators'

const STATUS_COLOR: Record<string, string> = {
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

/** Normalise an Egyptian phone number to wa.me format (country code 20). */
function waPhone(raw?: string) {
  let d = (raw || '').replace(/[^\d]/g, '')
  if (d.startsWith('20')) return d
  if (d.startsWith('0')) return '20' + d.slice(1)
  if (d.length === 10) return '20' + d
  return d
}

function buildWhatsApp(r: any) {
  // Prefix every line with a Right-to-Left Mark so mixed Arabic/Latin/number
  // content stays RTL and each field renders correctly on its own line.
  const rlm = '‏'
  const L = (s: string) => rlm + s
  const route = String(r.route_name || '').replace(/\s*[←→]\s*/g, ' - ')
  const amount = Number(r.amount || 0).toLocaleString('ar-EG')
  const lines = [
    L(`أهلاً بك يا ${r.student_name || ''} في شركة القاضي للرحلات`),
    '',
    L('تفاصيل اشتراكك معنا:'),
    L(`- نوع الاشتراك: ${r.type_display || '—'}`),
    L(`- خط السير: ${route || '—'}`),
    L(`- الوجهة: ${r.destination_name || '—'}`),
    L(`- الجامعة: ${r.university_name || '—'}`),
    L(`- المركز: ${r.pickup_center_display || '—'}`),
    L(`- نقطة الالتقاط: ${r.pickup_name || '—'}`),
    L(`- المبلغ: ${amount} جنيه`),
    L(`- طريقة الدفع: ${r.method_name || '—'}`),
    L(`- حالة الحجز: ${r.status_display || '—'}`),
    '',
    L('شكراً لاختيارك القاضي لخدمات النقل والرحلات.'),
  ]
  return lines.join('\n')
}

function downloadCSV(rows: any[]) {
  const head = ['الطالب', 'الهاتف', 'النوع', 'خط السير', 'الوجهة', 'الجامعة', 'المركز', 'نقطة الالتقاط', 'المبلغ', 'طريقة الدفع', 'الحالة']
  const body = rows.map((r) => [
    r.student_name, r.student_phone, r.type_display, r.route_name, r.destination_name,
    r.university_name, r.pickup_center_display || '', r.pickup_name || '',
    Number(r.amount || 0), r.method_name || '', r.status_display,
  ])
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = '﻿' + [head, ...body].map((row) => row.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = `subscriptions-${dayjs().format('YYYYMMDD-HHmm')}.csv`
  a.click(); URL.revokeObjectURL(url)
}

function exportPDF(rows: any[]) {
  const head = ['الطالب', 'الهاتف', 'النوع', 'خط السير', 'الجامعة', 'المركز', 'نقطة الالتقاط', 'المبلغ', 'الدفع', 'الحالة']
  const trs = rows.map((r) => `<tr>${[
    r.student_name, r.student_phone, r.type_display, r.route_name, r.university_name,
    r.pickup_center_display || '', r.pickup_name || '', Number(r.amount || 0).toLocaleString(),
    r.method_name || '', r.status_display,
  ].map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>الطلاب والاشتراكات</title><style>
    body{font-family:'Cairo',Arial,sans-serif;padding:24px;color:#0f172a}
    h2{color:#0B2E5E} .sub{color:#64748b;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:center}
    th{background:#0B2E5E;color:#fff}</style></head>
    <body><h2>القاضي — ELKADY TRAVEL · الطلاب والاشتراكات</h2>
    <div class="sub">${dayjs().format('YYYY-MM-DD HH:mm')} · العدد: ${rows.length}</div>
    <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${trs}</tbody></table>
    </body></html>`
  // Hidden iframe instead of window.open → not blocked by popup blockers.
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) { document.body.removeChild(iframe); return }
  doc.open(); doc.write(html); doc.close()
  setTimeout(() => {
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print() }
    finally { setTimeout(() => document.body.removeChild(iframe), 1500) }
  }, 300)
}

/* ---------- Student profile preview + edit ---------- */
function ProfileModal({ studentId, onClose }: { studentId: number | null; onClose: () => void }) {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm()
  const [editing, setEditing] = useState(false)
  const [editUni, setEditUni] = useState<number>()
  const [editCenter, setEditCenter] = useState<string>()
  const { data: students } = useUsersQuery({ role: 'student', page_size: 2000 }, { skip: !studentId })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: colleges } = useCollegesQuery({ university: editUni }, { skip: !editUni })
  const { data: pickups } = usePublicPickupPointsQuery(editCenter, { skip: !editCenter })
  const [saveUser, { isLoading }] = useSaveUserMutation()

  const student = (students?.results || []).find((u: any) => u.id === studentId)

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

  return (
    <Modal open={!!studentId} onCancel={() => { setEditing(false); onClose() }} width={640}
      title={student ? `ملف الطالب — ${student.full_name || student.username}` : 'ملف الطالب'}
      footer={editing
        ? [<Button key="c" onClick={() => setEditing(false)}>إلغاء</Button>,
           <Button key="s" type="primary" loading={isLoading} onClick={save}>حفظ</Button>]
        : [<Button key="e" icon={<EditOutlined />} onClick={startEdit}>تعديل البيانات</Button>,
           <Button key="x" onClick={onClose}>إغلاق</Button>]}>
      {!student ? 'جارٍ التحميل…' : editing ? (
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
        </Form>
      ) : (
        <Descriptions bordered size="small" column={1}>
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
      )}
    </Modal>
  )
}

export default function Subscriptions() {
  const [type, setType] = useState('all')
  // For the daily family: filter by direction (ذهاب/عودة/ذهاب وعودة). 'all' = كل اليومي.
  const [dailyDir, setDailyDir] = useState('all')
  const [route, setRoute] = useState<number>()
  const [university, setUniversity] = useState<number>()
  const [status, setStatus] = useState<string>()
  const [center, setCenter] = useState<string>()
  const [pickup, setPickup] = useState<number>()
  const [ordering, setOrdering] = useState<string>()
  const [profileId, setProfileId] = useState<number | null>(null)

  const { data: routes } = useRoutesQuery({ active: true })
  const { data: unis } = useUniversitiesQuery({ active: true })
  const { data: pickups } = usePublicPickupPointsQuery(center, { skip: !center })
  // All registered students — used to surface those without any subscription.
  const { data: allStudentsData } = useUsersQuery({ role: 'student', page_size: 5000 })
  const [orphansOpen, setOrphansOpen] = useState(false)

  const params: any = { route, university, status, center, pickup_point: pickup, ordering, page_size: 1000 }
  if (type !== 'all') params.subscription_type = (type === 'daily' && dailyDir !== 'all') ? dailyDir : type
  const { data, isFetching } = useSubscriptionsQuery(params)
  const rows = data?.results || []

  // Unfiltered subscriptions → reconcile counts with the dashboard.
  const { data: allSubsData } = useSubscriptionsQuery({ page_size: 5000 })
  const allSubs = allSubsData?.results || []
  const studentsWithSubs = new Set<number>(allSubs.map((s: any) => s.student).filter(Boolean))
  // Confirmed subscribers = matches the dashboard "مشتركو الترم/الشهري" definition.
  const confirmedStudents = new Set<number>(
    allSubs.filter((s: any) => s.status === 'confirmed').map((s: any) => s.student).filter(Boolean)
  )
  const pendingStudents = new Set<number>(
    allSubs.filter((s: any) => ['payment_pending', 'payment_submitted', 'under_review'].includes(s.status))
      .map((s: any) => s.student).filter(Boolean)
  )
  const allStudents = allStudentsData?.results || []
  const orphanStudents = allStudents.filter((u: any) => !studentsWithSubs.has(u.id))
  const { message, modal } = AntdApp.useApp()
  const [del] = useDeleteSubscriptionMutation()
  const [markNotified] = useMarkSubscriptionNotifiedMutation()
  const [clearNotified] = useClearSubscriptionNotifiedMutation()

  const remove = (r: any) => {
    modal.confirm({
      title: `حذف اشتراك «${r.student_name || ''}»؟`,
      content: `${r.type_display || ''} — ${r.route_name || ''} — ${Number(r.amount || 0).toLocaleString()} ج.م. لا يمكن التراجع.`,
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => {
        try { await del(r.id).unwrap(); message.success('تم حذف الاشتراك') }
        catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحذف') }
      },
    })
  }

  return (
    <Card
      title="الطلاب والاشتراكات"
      extra={
        <Space wrap>
          <Button icon={<FileExcelOutlined />} onClick={() => downloadCSV(rows)}>Excel</Button>
          <Button icon={<FilePdfOutlined />} onClick={() => exportPDF(rows)}>PDF</Button>
        </Space>
      }
    >
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        marginBottom: 12, padding: '8px 12px', background: '#f8fafc',
        border: '1px solid #e5e7eb', borderRadius: 8,
      }}>
        <Tag color="blue" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>
          طلاب مسجّلون: <b>{allStudents.length}</b>
        </Tag>
        <Tag color="green" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>
          مشتركون مؤكدون: <b>{confirmedStudents.size}</b>
        </Tag>
        <Tag color="gold" style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>
          قيد المراجعة: <b>{pendingStudents.size}</b>
        </Tag>
        <Tag color={orphanStudents.length ? 'orange' : 'default'} style={{ margin: 0, fontSize: 13, padding: '2px 10px' }}>
          بدون اشتراك: <b>{orphanStudents.length}</b>
        </Tag>
        {orphanStudents.length > 0 && (
          <Button size="small" onClick={() => setOrphansOpen(true)}>
            عرض الطلاب بدون اشتراك
          </Button>
        )}
        <span style={{ color: '#64748b', fontSize: 12, marginInlineStart: 'auto' }}>
          الجدول أدناه يعرض <b>سجلات الاشتراكات</b> — الطالب المسجل الذي لم يحجز أي اشتراك لن يظهر فيه.
        </span>
      </div>
      <Space wrap style={{ marginBottom: 12 }}>
        <Segmented value={type} onChange={(v) => { setType(v as string); if (v !== 'daily') setDailyDir('all') }}
          options={[{ value: 'all', label: 'الكل' }, { value: 'term', label: 'ترم' },
            { value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]} />
        {type === 'daily' && (
          <Segmented value={dailyDir} onChange={(v) => setDailyDir(v as string)}
            options={[{ value: 'all', label: 'كل اليومي' }, { value: 'daily_go', label: 'ذهاب فقط' },
              { value: 'daily_return', label: 'عودة فقط' }, { value: 'daily_round', label: 'ذهاب وعودة' }]} />
        )}
        <Select placeholder="الترتيب بالاسم" allowClear style={{ width: 160 }} value={ordering} onChange={setOrdering}
          options={[{ value: 'student__full_name', label: 'الاسم تصاعدي ↑' }, { value: '-student__full_name', label: 'الاسم تنازلي ↓' }]} />
        <Select placeholder="المركز" allowClear style={{ width: 140 }} value={center}
          onChange={(v) => { setCenter(v); setPickup(undefined) }} options={CENTERS} />
        <Select placeholder="نقطة الالتقاط" allowClear style={{ width: 170 }} value={pickup} onChange={setPickup}
          disabled={!center} showSearch optionFilterProp="label"
          options={dedupePickups(pickups || []).map((p: any) => ({ value: p.id, label: p.name }))} />
        <Select placeholder="المسار" allowClear style={{ width: 160 }} value={route} onChange={setRoute}
          options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))} />
        <Select placeholder="الجامعة" allowClear style={{ width: 150 }} value={university} onChange={setUniversity}
          options={(unis?.results || []).map((u: any) => ({ value: u.id, label: u.name }))} />
        <Select placeholder="الحالة" allowClear style={{ width: 140 }} value={status} onChange={setStatus}
          options={[{ value: 'confirmed', label: 'مؤكد' }, { value: 'payment_submitted', label: 'قيد المراجعة' },
            { value: 'rejected', label: 'مرفوض' }, { value: 'payment_pending', label: 'بانتظار الدفع' }]} />
      </Space>

      <Table
        rowKey="id" loading={isFetching} scroll={{ x: 1100 }} dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        rowClassName={(r: any) => (r.whatsapp_notified_at ? 'sub-row-notified' : '')}
        columns={[
          { title: 'الطالب', dataIndex: 'student_name', width: 200,
            sorter: (a: any, b: any) => (a.student_name || '').localeCompare(b.student_name || '', 'ar'), defaultSortOrder: undefined,
            render: (v, r: any) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{v}</span>
                {r.whatsapp_notified_at && <Tag color="green" style={{ margin: 0 }}>✓ تم الإرسال</Tag>}
              </div>
            ),
          },
          { title: 'الهاتف', dataIndex: 'student_phone' },
          { title: 'النوع', dataIndex: 'type_display', render: (v) => <Tag color="cyan">{v}</Tag> },
          { title: 'المسار', dataIndex: 'route_name' },
          { title: 'المركز', dataIndex: 'pickup_center_display', render: (v) => v || '—' },
          { title: 'نقطة الالتقاط', dataIndex: 'pickup_name', render: (v) => v || '—' },
          { title: 'المبلغ', dataIndex: 'amount', align: 'center', sorter: (a: any, b: any) => Number(a.amount) - Number(b.amount), render: (v) => `${Number(v || 0).toLocaleString()} ج.م` },
          { title: 'طريقة الدفع', dataIndex: 'method_name', render: (v) => v || '—' },
          { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={STATUS_COLOR[r.status]}>{v}</Tag> },
          {
            title: 'إجراءات', fixed: 'right', width: 200, render: (_, r: any) => (
              <Space>
                <Tooltip title="معاينة الملف"><Button size="small" icon={<EyeOutlined />} onClick={() => setProfileId(r.student)} /></Tooltip>
                <Tooltip title={r.whatsapp_notified_at
                  ? `تم الإرسال — ${dayjs(r.whatsapp_notified_at).format('YYYY-MM-DD HH:mm')} — اضغط لإعادة الفتح`
                  : 'رسالة واتساب — اضغط لفتح المحادثة وتعليمها كـ«تم الإرسال»'}>
                  <Button size="small" icon={<WhatsAppOutlined />}
                    style={{ color: r.whatsapp_notified_at ? '#94a3b8' : '#25D366' }}
                    onClick={() => {
                      window.open(`https://wa.me/${waPhone(r.student_phone)}?text=${encodeURIComponent(buildWhatsApp(r))}`, '_blank')
                      markNotified(r.id)
                    }} />
                </Tooltip>
                {r.whatsapp_notified_at && (
                  <Tooltip title="إلغاء تعليم «تم الإرسال»">
                    <Button size="small" onClick={() => clearNotified(r.id)}>↺</Button>
                  </Tooltip>
                )}
                <Tooltip title="حذف الاشتراك"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(r)} /></Tooltip>
              </Space>
            ),
          },
        ]}
      />
      <ProfileModal studentId={profileId} onClose={() => setProfileId(null)} />

      <Modal
        title={`طلاب مسجلون بلا أي اشتراك (${orphanStudents.length})`}
        open={orphansOpen} onCancel={() => setOrphansOpen(false)} footer={null} width={720}
      >
        <Table
          rowKey="id" size="small" pagination={{ pageSize: 20, showSizeChanger: false }}
          dataSource={orphanStudents} scroll={{ x: 560 }}
          locale={{ emptyText: 'لا يوجد' }}
          columns={[
            { title: 'الاسم', dataIndex: 'full_name', render: (v, r: any) => v || r.username },
            { title: 'اسم المستخدم', dataIndex: 'username' },
            { title: 'الهاتف', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'البريد', dataIndex: 'email', render: (v) => v || '—' },
            { title: 'الجامعة', dataIndex: 'university_name', render: (v) => v || '—' },
            { title: 'المركز', dataIndex: 'center_display', render: (v) => v || '—' },
          ]}
        />
      </Modal>
    </Card>
  )
}

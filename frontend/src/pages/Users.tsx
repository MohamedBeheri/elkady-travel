import { Card, Table, Tag, Button, Modal, Form, Input, Select, Space, App as AntdApp } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useUsersQuery, useSaveUserMutation, useDeleteUserMutation } from '../app/api'
import { phoneRule } from '../app/validators'

const ROLE_OPTS = [
  { value: 'admin', label: 'مدير عام' },
  { value: 'transport_manager', label: 'مدير النقل' },
  { value: 'payment_officer', label: 'مسؤول المدفوعات' },
  { value: 'operations', label: 'مشرف التشغيل' },
  { value: 'bus_supervisor', label: 'مشرف الأسطول' },
  { value: 'driver', label: 'سائق' },
  { value: 'tourism_manager', label: 'مدير السياحة' },
]
const ROLE_COLOR: Record<string, string> = { admin: 'red', student: 'default' }

export default function Users() {
  const { message, modal } = AntdApp.useApp()
  const [role, setRole] = useState<string>()
  const { data, isFetching } = useUsersQuery({ page_size: 1000, ...(role ? { role } : {}) })
  const [save] = useSaveUserMutation()
  const [del] = useDeleteUserMutation()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const openModal = (row?: any) => { setEditing(row || null); form.resetFields(); if (row) form.setFieldsValue(row); setOpen(true) }
  const remove = (row: any) => {
    modal.confirm({
      title: `حذف «${row.full_name || row.username}»؟`,
      content: 'سيتم حذف الحساب وكل بياناته المرتبطة نهائياً. لا يمكن التراجع.',
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => {
        try { await del(row.id).unwrap(); message.success('تم الحذف') }
        catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحذف') }
      },
    })
  }
  const submit = async () => {
    const v = await form.validateFields()
    await save({ ...(editing ? { id: editing.id } : {}), ...v }).unwrap()
    message.success('تم الحفظ'); setOpen(false)
  }

  return (
    <Card
      title="المستخدمون والصلاحيات"
      extra={
        <Select placeholder="كل الأدوار" allowClear style={{ width: 160 }} value={role} onChange={setRole}
          options={[...ROLE_OPTS, { value: 'student', label: 'طالب' }]} />
      }
    >
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()} style={{ marginBottom: 12 }}>موظف جديد</Button>
      <Table
        rowKey="id" loading={isFetching} dataSource={data?.results || []} scroll={{ x: 600 }}
        pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `الإجمالي: ${t}` }}
        columns={[
          { title: 'الاسم', dataIndex: 'full_name', render: (v, r: any) => v || r.username },
          { title: 'اسم المستخدم', dataIndex: 'username' },
          { title: 'الدور', dataIndex: 'role_display', render: (v, r: any) => <Tag color={ROLE_COLOR[r.role] || 'blue'}>{v}</Tag> },
          { title: 'الهاتف', dataIndex: 'phone', render: (v) => v || '—' },
          { title: 'نشط', dataIndex: 'is_active', render: (v) => v ? <Tag color="green">نعم</Tag> : <Tag>لا</Tag> },
          { title: '', render: (_, r: any) => (
            <Space>
              {r.role !== 'student' && <Button size="small" onClick={() => openModal(r)}>تعديل</Button>}
              <Button size="small" danger onClick={() => remove(r)}>حذف</Button>
            </Space>
          ) },
        ]}
      />
      <Modal title="موظف" open={open} onOk={submit} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="full_name" label="الاسم الكامل" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="username" label="اسم المستخدم" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="role" label="الدور" rules={[{ required: true }]}><Select options={ROLE_OPTS} /></Form.Item>
          <Form.Item name="phone" label="الهاتف" rules={[phoneRule]}><Input inputMode="numeric" maxLength={11} /></Form.Item>
          <Form.Item name="email" label="البريد الإلكتروني" rules={[{ type: 'email', message: 'بريد إلكتروني غير صحيح' }]}>
            <Input inputMode="email" placeholder="example@mail.com" />
          </Form.Item>
          <Form.Item name="password" label={editing ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'} rules={editing ? [] : [{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

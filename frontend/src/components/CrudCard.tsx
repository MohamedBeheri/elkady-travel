import { Card, Table, Button, Modal, Form, Input, Select, InputNumber, Switch, DatePicker, Space, App as AntdApp } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'

export interface Field {
  name: string; label: string; required?: boolean
  type?: 'text' | 'number' | 'select' | 'switch' | 'date' | 'textarea'
  options?: { value: any; label: string }[]; initial?: any
}

interface Props {
  title: string
  rows: any[]
  columns: any[]
  fields: Field[]
  onSave: (v: any) => Promise<any>
  onDelete?: (id: number) => Promise<any>
  rowName?: (row: any) => string
  loading?: boolean
  toolbar?: React.ReactNode
  addLabel?: string
  canEdit?: boolean
  rowExtra?: (row: any) => React.ReactNode
  dateFields?: string[]
}

export default function CrudCard({ title, rows, columns, fields, onSave, onDelete, rowName, loading, toolbar, addLabel = 'إضافة', canEdit = true, rowExtra, dateFields = ['date', 'license_expiry', 'travel_date', 'date_of_birth', 'effective_date', 'end_date'] }: Props) {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const openModal = (row?: any) => {
    setEditing(row || null); form.resetFields()
    if (row) {
      const v: any = { ...row }
      dateFields.forEach((f) => { if (v[f]) v[f] = dayjs(v[f]) })
      form.setFieldsValue(v)
    } else {
      const init: any = {}
      fields.forEach((f) => { if (f.initial !== undefined) init[f.name] = f.initial })
      form.setFieldsValue(init)
    }
    setOpen(true)
  }

  const submit = async () => {
    try {
      const v = await form.validateFields()
      dateFields.forEach((f) => { if (v[f]?.format) v[f] = v[f].format('YYYY-MM-DD') })
      setSaving(true)
      await onSave({ ...(editing ? { id: editing.id } : {}), ...v })
      message.success('تم الحفظ'); setOpen(false)
    } catch (e: any) {
      if (e?.data?.detail || e?.data) message.error(e.data.detail || Object.values(e.data).flat().join('، '))
    } finally { setSaving(false) }
  }

  const remove = (row: any) => {
    Modal.confirm({
      title: `حذف «${rowName ? rowName(row) : (row.name || row.full_name || row.plate_number || '')}»؟`,
      content: 'لا يمكن التراجع عن هذا الإجراء.',
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => {
        try { await onDelete!(row.id); message.success('تم الحذف') }
        catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحذف — قد يكون مرتبطاً بسجلات أخرى.') }
      },
    })
  }

  const cols = [
    ...columns,
    {
      title: '', key: '_a', render: (_: any, r: any) => (
        <Space>
          {rowExtra && rowExtra(r)}
          {canEdit && <Button size="small" onClick={() => openModal(r)}>تعديل</Button>}
          {onDelete && <Button size="small" danger onClick={() => remove(r)}>حذف</Button>}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={<span style={{ fontWeight: 800 }}>{title}</span>}
      extra={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>{addLabel}</Button>}
    >
      {toolbar && <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>{toolbar}</div>}
      <Table rowKey="id" loading={loading} dataSource={rows} columns={cols} scroll={{ x: 'max-content' }} size="middle" />
      <Modal title={title} open={open} onOk={submit} confirmLoading={saving} onCancel={() => setOpen(false)} okText="حفظ">
        <Form form={form} layout="vertical">
          {fields.map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true, message: 'مطلوب' }] : []}
              valuePropName={f.type === 'switch' ? 'checked' : 'value'}>
              {f.type === 'select' ? <Select options={f.options} showSearch optionFilterProp="label" allowClear />
                : f.type === 'number' ? <InputNumber style={{ width: '100%' }} min={0} />
                : f.type === 'switch' ? <Switch />
                : f.type === 'date' ? <DatePicker style={{ width: '100%' }} />
                : f.type === 'textarea' ? <Input.TextArea rows={2} />
                : <Input />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </Card>
  )
}

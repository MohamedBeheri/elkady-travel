import { Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Switch, DatePicker, Tag, Space, App as AntdApp } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useRoutesQuery, useSaveRouteMutation, useDestinationsQuery,
  usePickupPointsQuery, useSavePickupMutation, useDeletePickupMutation,
  useUniversitiesQuery, useSaveUniversityMutation,
  usePricesQuery, useSavePriceMutation,
  useMorningSlotsQuery, useSaveMorningSlotMutation,
  useReturnSlotsQuery, useSaveReturnSlotMutation,
  useCapacitiesQuery, useSaveCapacityMutation,
  usePaymentAccountsQuery, useSavePaymentAccountMutation, usePaymentMethodsQuery,
} from '../app/api'

const TYPE_OPTS = [{ value: 'term', label: 'ترم' }, { value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]

/* ---------- Routes + pickup points ---------- */
function RoutesTab() {
  const { message } = AntdApp.useApp()
  const { data: routes } = useRoutesQuery()
  const { data: dests } = useDestinationsQuery()
  const [saveRoute] = useSaveRouteMutation()
  const [savePickup] = useSavePickupMutation()
  const [delPickup] = useDeletePickupMutation()
  const [form] = Form.useForm()
  const [pForm] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [pickupFor, setPickupFor] = useState<any>(null)

  const submit = async () => {
    const v = await form.validateFields()
    await saveRoute(v).unwrap(); message.success('تم الحفظ'); setOpen(false); form.resetFields()
  }
  const addPickup = async () => {
    const v = await pForm.validateFields()
    await savePickup({ ...v, route: pickupFor.id }).unwrap(); message.success('تمت الإضافة'); pForm.resetFields()
  }

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setOpen(true) }} style={{ marginBottom: 12 }}>مسار جديد</Button>
      <Table
        rowKey="id" dataSource={routes?.results || []} pagination={false}
        expandable={{
          expandedRowRender: (r: any) => (
            <div>
              <Space wrap style={{ marginBottom: 8 }}>
                {(r.pickup_points || []).map((p: any) => (
                  <Tag key={p.id} closable onClose={async () => { await delPickup(p.id); message.success('تم الحذف') }}>{p.sequence}. {p.name}</Tag>
                ))}
              </Space>
              <div><Button size="small" onClick={() => { pForm.resetFields(); setPickupFor(r) }}>+ نقطة التقاط</Button></div>
            </div>
          ),
        }}
        columns={[
          { title: 'الكود', dataIndex: 'code' },
          { title: 'الاسم', dataIndex: 'name' },
          { title: 'الوجهة', dataIndex: 'destination_name' },
          { title: 'نقاط', render: (_, r: any) => r.pickup_points?.length || 0 },
          { title: 'نشط', dataIndex: 'active', render: (v) => v ? <Tag color="green">نعم</Tag> : <Tag>لا</Tag> },
        ]}
      />
      <Modal title="مسار" open={open} onOk={submit} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="الكود" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="origin_label" label="خط الانطلاق" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="اسم المسار" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="destination" label="الوجهة" rules={[{ required: true }]}>
            <Select options={(dests?.results || dests || []).map((d: any) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="active" label="نشط" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>
      <Modal title={`نقطة التقاط — ${pickupFor?.name || ''}`} open={!!pickupFor} onOk={addPickup} onCancel={() => setPickupFor(null)}>
        <Form form={pForm} layout="vertical">
          <Form.Item name="name" label="الاسم" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sequence" label="الترتيب" initialValue={1}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ---------- generic simple CRUD tab ---------- */
function SimpleTab({ title, rows, columns, fields, onSave }: any) {
  const { message } = AntdApp.useApp()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const openModal = (row?: any) => {
    setEditing(row || null); form.resetFields()
    if (row) form.setFieldsValue({ ...row, effective_date: row.effective_date ? dayjs(row.effective_date) : undefined })
    setOpen(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    if (v.effective_date) v.effective_date = v.effective_date.format('YYYY-MM-DD')
    await onSave({ ...(editing ? { id: editing.id } : {}), ...v }).unwrap()
    message.success('تم الحفظ'); setOpen(false)
  }
  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()} style={{ marginBottom: 12 }}>إضافة</Button>
      <Table rowKey="id" dataSource={rows} pagination={false}
        columns={[...columns, { title: '', render: (_: any, r: any) => <Button size="small" onClick={() => openModal(r)}>تعديل</Button> }]} />
      <Modal title={title} open={open} onOk={submit} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical">
          {fields.map((f: any) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true }] : []}
              valuePropName={f.type === 'switch' ? 'checked' : 'value'} initialValue={f.initial}>
              {f.type === 'select' ? <Select options={f.options} />
                : f.type === 'number' ? <InputNumber style={{ width: '100%' }} min={0} />
                : f.type === 'switch' ? <Switch />
                : f.type === 'date' ? <DatePicker style={{ width: '100%' }} />
                : f.type === 'time' ? <Input placeholder="HH:MM:SS مثال 06:00:00" />
                : <Input />}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </>
  )
}

function UniversitiesTab() {
  const { data } = useUniversitiesQuery()
  const { data: dests } = useDestinationsQuery()
  const [save] = useSaveUniversityMutation()
  return <SimpleTab title="جامعة" rows={data?.results || []} onSave={save}
    columns={[{ title: 'الاسم', dataIndex: 'name' }, { title: 'الوجهة', dataIndex: 'destination_name' }, { title: 'نشط', dataIndex: 'active', render: (v: any) => v ? 'نعم' : 'لا' }]}
    fields={[
      { name: 'name', label: 'الاسم', required: true },
      { name: 'name_en', label: 'بالإنجليزية' },
      { name: 'destination', label: 'الوجهة', type: 'select', required: true, options: (dests?.results || dests || []).map((d: any) => ({ value: d.id, label: d.name })) },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

function PricesTab() {
  const { data } = usePricesQuery()
  const { data: routes } = useRoutesQuery({ active: true })
  const [save] = useSavePriceMutation()
  return <SimpleTab title="سعر" rows={data?.results || []} onSave={save}
    columns={[{ title: 'النوع', dataIndex: 'type_display' }, { title: 'المسار', dataIndex: 'route_name' }, { title: 'السعر', dataIndex: 'price' }, { title: 'من', dataIndex: 'effective_date' }, { title: 'نشط', dataIndex: 'active', render: (v: any) => v ? 'نعم' : 'لا' }]}
    fields={[
      { name: 'subscription_type', label: 'نوع الاشتراك', type: 'select', required: true, options: TYPE_OPTS },
      { name: 'route', label: 'المسار', type: 'select', required: true, options: (routes?.results || []).map((r: any) => ({ value: r.id, label: r.name })) },
      { name: 'price', label: 'السعر', type: 'number', required: true },
      { name: 'effective_date', label: 'تاريخ السريان', type: 'date', required: true },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

function SchedulesTab() {
  const { data: mslots } = useMorningSlotsQuery()
  const { data: rslots } = useReturnSlotsQuery()
  const { data: caps } = useCapacitiesQuery()
  const { data: routes } = useRoutesQuery({ active: true })
  const [saveM] = useSaveMorningSlotMutation()
  const [saveR] = useSaveReturnSlotMutation()
  const [saveC] = useSaveCapacityMutation()
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <Card size="small" title="مواعيد الذهاب">
        <SimpleTab title="موعد ذهاب" rows={mslots?.results || mslots || []} onSave={saveM}
          columns={[{ title: 'الاسم', dataIndex: 'name' }, { title: 'الوقت', dataIndex: 'departure_time' }]}
          fields={[{ name: 'code', label: 'الكود', required: true }, { name: 'name', label: 'الاسم', required: true }, { name: 'departure_time', label: 'الوقت', type: 'time', required: true }, { name: 'active', label: 'نشط', type: 'switch', initial: true }]} />
      </Card>
      <Card size="small" title="مواعيد العودة وسعتها">
        <SimpleTab title="موعد عودة" rows={rslots?.results || rslots || []} onSave={saveR}
          columns={[{ title: 'الاسم', dataIndex: 'name' }, { title: 'الوقت', dataIndex: 'departure_time' }, { title: 'السعة', dataIndex: 'capacity' }]}
          fields={[{ name: 'code', label: 'الكود', required: true }, { name: 'name', label: 'الاسم', required: true }, { name: 'departure_time', label: 'الوقت', type: 'time', required: true }, { name: 'capacity', label: 'السعة', type: 'number', required: true }, { name: 'active', label: 'نشط', type: 'switch', initial: true }]} />
      </Card>
      <Card size="small" title="سعة المقاعد (لكل مسار وموعد)">
        <SimpleTab title="سعة" rows={caps?.results || caps || []} onSave={saveC}
          columns={[{ title: 'المسار', dataIndex: 'route_name' }, { title: 'الموعد', dataIndex: 'slot_name' }, { title: 'المقاعد', dataIndex: 'total_seats' }]}
          fields={[
            { name: 'route', label: 'المسار', type: 'select', required: true, options: (routes?.results || []).map((r: any) => ({ value: r.id, label: r.name })) },
            { name: 'morning_slot', label: 'الموعد', type: 'select', required: true, options: (mslots?.results || mslots || []).map((s: any) => ({ value: s.id, label: s.name })) },
            { name: 'total_seats', label: 'إجمالي المقاعد', type: 'number', required: true },
          ]} />
      </Card>
    </div>
  )
}

function PaymentsTab() {
  const { data } = usePaymentAccountsQuery()
  const { data: methods } = usePaymentMethodsQuery()
  const [save] = useSavePaymentAccountMutation()
  return <SimpleTab title="حساب استلام" rows={data?.results || data || []} onSave={save}
    columns={[{ title: 'الوسيلة', dataIndex: 'method_name' }, { title: 'صاحب الحساب', dataIndex: 'holder_name' }, { title: 'الرقم', dataIndex: 'number' }]}
    fields={[
      { name: 'method', label: 'الوسيلة', type: 'select', required: true, options: (methods?.results || methods || []).map((m: any) => ({ value: m.id, label: m.name })) },
      { name: 'holder_name', label: 'اسم صاحب الحساب', required: true },
      { name: 'number', label: 'الرقم / المحفظة', required: true },
      { name: 'instructions', label: 'تعليمات' },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

export default function Config() {
  return (
    <Card title="الإعدادات والتهيئة">
      <Tabs
        items={[
          { key: 'routes', label: 'المسارات ونقاط الالتقاط', children: <RoutesTab /> },
          { key: 'unis', label: 'الجامعات', children: <UniversitiesTab /> },
          { key: 'prices', label: 'الأسعار', children: <PricesTab /> },
          { key: 'schedules', label: 'المواعيد والسعات', children: <SchedulesTab /> },
          { key: 'payments', label: 'حسابات الاستلام', children: <PaymentsTab /> },
        ]}
      />
    </Card>
  )
}

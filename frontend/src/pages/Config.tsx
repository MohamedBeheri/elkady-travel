import { Card, Tabs, Table, Button, Modal, Form, Input, Select, InputNumber, Switch, DatePicker, Tag, Space, Drawer, Segmented, App as AntdApp } from 'antd'
import SeatGenderEditor from '../components/SeatGenderEditor'
import { PlusOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import {
  useRoutesQuery, useSaveRouteMutation, useDeleteRouteMutation, useDestinationsQuery,
  usePickupPointsQuery, useSavePickupMutation, useDeletePickupMutation,
  usePickupTimesMatrixQuery, useSavePickupTimesMutation,
  useUniversitiesQuery, useSaveUniversityMutation, useDeleteUniversityMutation,
  useCollegesQuery, useSaveCollegeMutation, useDeleteCollegeMutation, useLayoutsQuery,
  usePricesQuery, useSavePriceMutation, useDeletePriceMutation,
  useMorningSlotsQuery, useSaveMorningSlotMutation,
  useReturnSlotsQuery, useSaveReturnSlotMutation,
  useCapacitiesQuery, useSaveCapacityMutation,
  usePaymentAccountsQuery, useSavePaymentAccountMutation, useDeletePaymentAccountMutation, usePaymentMethodsQuery,
} from '../app/api'

const TYPE_OPTS = [{ value: 'term', label: 'ترم' }, { value: 'monthly', label: 'شهري' }, { value: 'daily', label: 'يومي' }]

/* ---------- Routes + pickup points ---------- */
function RoutesTab() {
  const { message, modal } = AntdApp.useApp()
  const { data: routes } = useRoutesQuery({ page_size: 1000 })
  const { data: dests } = useDestinationsQuery()
  const [saveRoute] = useSaveRouteMutation()
  const [delRoute] = useDeleteRouteMutation()
  const [savePickup] = useSavePickupMutation()
  const [delPickup] = useDeletePickupMutation()
  const [form] = Form.useForm()
  const [pForm] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [pickupFor, setPickupFor] = useState<any>(null)

  const openRoute = (row?: any) => {
    setEditing(row || null); form.resetFields()
    if (row) form.setFieldsValue(row)
    setOpen(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    await saveRoute(editing ? { id: editing.id, ...v } : v).unwrap()
    message.success('تم الحفظ'); setOpen(false); setEditing(null); form.resetFields()
  }
  const removeRoute = (r: any) => {
    modal.confirm({
      title: `حذف المسار «${r.name}»؟`,
      content: 'سيتم حذف جميع نقاط الالتقاط المرتبطة به. لا يمكن التراجع.',
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => { await delRoute(r.id).unwrap(); message.success('تم حذف المسار') },
    })
  }
  const addPickup = async () => {
    const v = await pForm.validateFields()
    await savePickup({ ...v, route: pickupFor.id }).unwrap(); message.success('تمت الإضافة'); pForm.resetFields()
  }

  return (
    <>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openRoute()} style={{ marginBottom: 12 }}>مسار جديد</Button>
      <Table
        rowKey="id" dataSource={routes?.results || []} pagination={false} scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (r: any) => (
            <div>
              <Space wrap style={{ marginBottom: 8 }}>
                {(r.pickup_points || []).map((p: any) => (
                  <Tag key={p.id} closable onClose={async () => { await delPickup(p.id); message.success('تم الحذف') }}>
                    {p.sequence}. {p.name}{p.center_display ? ` — ${p.center_display}` : ''}
                  </Tag>
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
          { title: 'خريطة المقاعد', dataIndex: 'seat_selection_enabled', render: (v) => v ? <Tag color="blue">تظهر</Tag> : <Tag color="orange">تلقائي</Tag> },
          { title: 'نشط', dataIndex: 'active', render: (v) => v ? <Tag color="green">نعم</Tag> : <Tag>لا</Tag> },
          { title: '', render: (_, r: any) => (
            <Space>
              <Button size="small" onClick={() => openRoute(r)}>تعديل</Button>
              <Button size="small" danger onClick={() => removeRoute(r)}>حذف</Button>
            </Space>
          ) },
        ]}
      />
      <Modal title={editing ? 'تعديل المسار' : 'مسار جديد'} open={open} onOk={submit} onCancel={() => { setOpen(false); setEditing(null) }} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="الكود" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item name="origin_label" label="خط الانطلاق" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="اسم المسار" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="destination" label="الوجهة" rules={[{ required: true }]}>
            <Select options={(dests?.results || dests || []).map((d: any) => ({ value: d.id, label: d.name }))} />
          </Form.Item>
          <Form.Item name="seat_selection_enabled" label="إظهار خريطة اختيار المقاعد للطالب" valuePropName="checked" initialValue={true}
            tooltip="عند التفعيل يختار الطالب مقعده من الرسم؛ وإلا يُخصَّص له مقعد تلقائياً." extra="لو أُطفئت، لن تظهر خريطة المقاعد في الحجز ويُخصَّص المقعد تلقائياً.">
            <Switch />
          </Form.Item>
          <Form.Item name="active" label="نشط" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>
      </Modal>
      <Modal title={`نقطة التقاط — ${pickupFor?.name || ''}`} open={!!pickupFor} onOk={addPickup} onCancel={() => setPickupFor(null)}>
        <Form form={pForm} layout="vertical">
          <Form.Item name="name" label="الاسم" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="center" label="المركز">
            <Select allowClear placeholder="اختر المركز" options={[
              { value: 'shebin', label: 'شبين الكوم' },
              { value: 'quesna', label: 'قويسنا' },
              { value: 'bagour', label: 'الباجور' },
              { value: 'benha', label: 'بنها' },
            ]} />
          </Form.Item>
          <Form.Item name="sequence" label="الترتيب" initialValue={1}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ---------- generic simple CRUD tab ---------- */
function SimpleTab({ title, rows, columns, fields, onSave, onDelete, rowLabel, extraAction, toolbar }: any) {
  const { message, modal } = AntdApp.useApp()
  const [form] = Form.useForm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const remove = (row: any) => {
    modal.confirm({
      title: `حذف «${rowLabel ? rowLabel(row) : (row.name || row.holder_name || '')}»؟`,
      content: 'لا يمكن التراجع عن هذا الإجراء.',
      okText: 'حذف', okType: 'danger', cancelText: 'إلغاء',
      onOk: async () => {
        try { await onDelete(row.id).unwrap(); message.success('تم الحذف') }
        catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحذف — قد يكون مرتبطاً بسجلات أخرى.') }
      },
    })
  }

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
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>إضافة</Button>
        {toolbar}
      </div>
      <Table rowKey="id" dataSource={rows} scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 12, showSizeChanger: true, pageSizeOptions: ['10', '12', '20', '50', '100', '200'], showTotal: (t) => `الإجمالي: ${t}` }}
        columns={[...columns, { title: '', render: (_: any, r: any) => (
          <Space>
            {extraAction && extraAction(r)}
            <Button size="small" onClick={() => openModal(r)}>تعديل</Button>
            {onDelete && <Button size="small" danger onClick={() => remove(r)}>حذف</Button>}
          </Space>
        ) }]} />
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
  const { data } = useUniversitiesQuery({ page_size: 1000 })
  const { data: dests } = useDestinationsQuery()
  const [save] = useSaveUniversityMutation()
  const [del] = useDeleteUniversityMutation()
  return <SimpleTab title="جامعة" rows={data?.results || []} onSave={save} onDelete={del}
    columns={[{ title: 'الاسم', dataIndex: 'name' }, { title: 'الوجهة', dataIndex: 'destination_name' }, { title: 'نشط', dataIndex: 'active', render: (v: any) => v ? 'نعم' : 'لا' }]}
    fields={[
      { name: 'name', label: 'الاسم', required: true },
      { name: 'name_en', label: 'بالإنجليزية' },
      { name: 'destination', label: 'الوجهة', type: 'select', required: true, options: (dests?.results || dests || []).map((d: any) => ({ value: d.id, label: d.name })) },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

function CollegesTab() {
  const { data } = useCollegesQuery({ page_size: 1000 })
  const { data: unis } = useUniversitiesQuery({ active: true, page_size: 1000 })
  const [save] = useSaveCollegeMutation()
  const [del] = useDeleteCollegeMutation()
  const [uniFilter, setUniFilter] = useState<number>()
  const uniOptions = (unis?.results || []).map((u: any) => ({ value: u.id, label: u.name }))
  const all = data?.results || []
  const rows = uniFilter ? all.filter((c: any) => c.university === uniFilter) : all
  const toolbar = (
    <Select allowClear showSearch optionFilterProp="label" placeholder="فلترة بالجامعة"
      style={{ width: 240 }} value={uniFilter} onChange={setUniFilter} options={uniOptions} />
  )
  return <SimpleTab title="كلية" rows={rows} toolbar={toolbar} onSave={save} onDelete={del}
    columns={[{ title: 'الكلية', dataIndex: 'name' }, { title: 'الجامعة', dataIndex: 'university_name' }, { title: 'نشط', dataIndex: 'active', render: (v: any) => v ? 'نعم' : 'لا' }]}
    fields={[
      { name: 'name', label: 'اسم الكلية', required: true },
      { name: 'university', label: 'الجامعة', type: 'select', required: true, options: uniOptions },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

function PricesTab() {
  const { data } = usePricesQuery({ page_size: 1000 })
  const { data: routes } = useRoutesQuery({ active: true, page_size: 1000 })
  const [save] = useSavePriceMutation()
  const [del] = useDeletePriceMutation()
  return <SimpleTab title="سعر" rows={data?.results || []} onSave={save} onDelete={del}
    rowLabel={(r: any) => `${r.type_display} — ${r.route_name}`}
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
  const { data: routes } = useRoutesQuery({ active: true, page_size: 1000 })
  const { data: layouts } = useLayoutsQuery()
  const [saveM] = useSaveMorningSlotMutation()
  const [saveR] = useSaveReturnSlotMutation()
  const [saveC, { isLoading: savingC }] = useSaveCapacityMutation()
  const [genderCap, setGenderCap] = useState<any>(null)
  const layout = genderCap && layouts ? layouts[genderCap.layout || 'bus50'] : null
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
      <Card size="small" title="سعة المقاعد وتخصيص النوع (لكل مسار وموعد)">
        <SimpleTab title="سعة" rows={caps?.results || caps || []} onSave={saveC}
          columns={[
            { title: 'المسار', dataIndex: 'route_name' }, { title: 'الموعد', dataIndex: 'slot_name' },
            { title: 'المقاعد', dataIndex: 'total_seats' },
            { title: 'مقاعد إناث', dataIndex: 'female_seats', render: (v: any) => v || '—' },
            { title: 'مقاعد ذكور', dataIndex: 'male_seats', render: (v: any) => v || '—' },
          ]}
          fields={[
            { name: 'route', label: 'المسار', type: 'select', required: true, options: (routes?.results || []).map((r: any) => ({ value: r.id, label: r.name })) },
            { name: 'morning_slot', label: 'الموعد', type: 'select', required: true, options: (mslots?.results || mslots || []).map((s: any) => ({ value: s.id, label: s.name })) },
            { name: 'total_seats', label: 'إجمالي المقاعد', type: 'number', required: true },
            { name: 'female_seats', label: 'مقاعد الإناث (أرقام مفصولة بفاصلة)' },
            { name: 'male_seats', label: 'مقاعد الذكور (أرقام مفصولة بفاصلة)' },
            { name: 'booking_note', label: 'تعليمات الحجز' },
          ]}
          extraAction={(r: any) => (
            <Button size="small" type="primary" ghost onClick={() => setGenderCap(r)}>تخطيط بصري ♀♂</Button>
          )} />
      </Card>

      <Drawer title={genderCap ? `تخصيص نوع المقاعد — ${genderCap.route_name} (${genderCap.slot_name})` : ''}
        open={!!genderCap} onClose={() => setGenderCap(null)} width={560}>
        {genderCap && layout && (
          <SeatGenderEditor
            layout={layout} female={genderCap.female_seats} male={genderCap.male_seats} saving={savingC}
            onSave={async (v) => { await saveC({ id: genderCap.id, ...v }).unwrap(); setGenderCap(null) }}
          />
        )}
      </Drawer>
    </div>
  )
}

function PaymentsTab() {
  const { data } = usePaymentAccountsQuery()
  const { data: methods } = usePaymentMethodsQuery()
  const [save] = useSavePaymentAccountMutation()
  const [del] = useDeletePaymentAccountMutation()
  return <SimpleTab title="حساب استلام" rows={data?.results || data || []} onSave={save} onDelete={del}
    rowLabel={(r: any) => `${r.method_name} — ${r.holder_name}`}
    columns={[{ title: 'الوسيلة', dataIndex: 'method_name' }, { title: 'صاحب الحساب', dataIndex: 'holder_name' }, { title: 'الرقم', dataIndex: 'number' }]}
    fields={[
      { name: 'method', label: 'الوسيلة', type: 'select', required: true, options: (methods?.results || methods || []).map((m: any) => ({ value: m.id, label: m.name })) },
      { name: 'holder_name', label: 'اسم صاحب الحساب', required: true },
      { name: 'number', label: 'الرقم / المحفظة', required: true },
      { name: 'instructions', label: 'تعليمات' },
      { name: 'active', label: 'نشط', type: 'switch', initial: true },
    ]} />
}

/* ---------- Per-point times matrix (admin sets each point's time under each slot) ---------- */
function PickupTimesTab() {
  const { message } = AntdApp.useApp()
  const { data: routes } = useRoutesQuery({ active: true, page_size: 1000 })
  const { data: mslots } = useMorningSlotsQuery()
  const { data: rslots } = useReturnSlotsQuery()
  const [routeId, setRouteId] = useState<number>()
  const [direction, setDirection] = useState<'go' | 'return'>('go')
  const [slot, setSlot] = useState<number>()
  const [edited, setEdited] = useState<Record<number, string>>({})

  const { data: matrix, isFetching } = usePickupTimesMatrixQuery(
    { route: routeId as number, direction, slot: slot as number },
    { skip: !routeId || !slot })
  const [saveTimes, { isLoading }] = useSavePickupTimesMutation()

  useEffect(() => {
    const m: Record<number, string> = {}
    ;(matrix || []).forEach((r: any) => { if (r.time) m[r.pickup_point] = r.time })
    setEdited(m)
  }, [matrix])

  const slots = direction === 'return' ? (rslots?.results || rslots || []) : (mslots?.results || mslots || [])
  const reset = (fn: () => void) => { fn(); setSlot(undefined) }

  const save = async () => {
    const times = (matrix || []).map((r: any) => ({ pickup_point: r.pickup_point, time: edited[r.pickup_point] || '' }))
    try { await saveTimes({ direction, slot: slot as number, times }).unwrap(); message.success('تم حفظ مواعيد النقاط') }
    catch { message.error('تعذّر الحفظ') }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <Select placeholder="المسار" style={{ width: 260 }} value={routeId}
          onChange={(v) => reset(() => setRouteId(v))}
          options={(routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))} />
        <Segmented value={direction} onChange={(v) => reset(() => setDirection(v as any))}
          options={[{ value: 'go', label: 'ذهاب' }, { value: 'return', label: 'عودة' }]} />
        <Select placeholder="الرحلة (الموعد)" style={{ width: 160 }} value={slot} onChange={setSlot} disabled={!routeId}
          options={slots.map((s: any) => ({ value: s.id, label: s.name }))} />
        {routeId && slot && <Button type="primary" loading={isLoading} onClick={save}>حفظ كل المواعيد</Button>}
      </div>

      {!routeId || !slot ? (
        <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>اختر المسار والاتجاه والرحلة لعرض نقاطها وتحديد مواعيدها.</div>
      ) : (
        <>
          <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>
            حدّد وقت مرور الباص على كل نقطة تحت هذه الرحلة. اترك الوقت فارغاً إذا كانت النقطة لا تخدمها هذه الرحلة.
          </div>
          <Table rowKey="pickup_point" loading={isFetching} dataSource={matrix || []} scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100', '300'], showTotal: (t) => `الإجمالي: ${t}` }}
            columns={[
              { title: '#', dataIndex: 'sequence', width: 60 },
              { title: 'نقطة الالتقاط', dataIndex: 'name' },
              { title: 'المركز', dataIndex: 'center_display', render: (v) => v || '—' },
              { title: direction === 'return' ? 'وقت النزول' : 'وقت الالتقاط', width: 160, render: (_, r: any) => (
                <Input type="time" style={{ width: 130 }} value={edited[r.pickup_point] || ''}
                  onChange={(e) => setEdited((p) => ({ ...p, [r.pickup_point]: e.target.value }))} />
              ) },
            ]} />
        </>
      )}
    </div>
  )
}

export default function Config() {
  return (
    <Card title="الإعدادات والتهيئة">
      <Tabs
        items={[
          { key: 'routes', label: 'المسارات ونقاط الالتقاط', children: <RoutesTab /> },
          { key: 'pickup-times', label: 'مواعيد النقاط', children: <PickupTimesTab /> },
          { key: 'unis', label: 'الجامعات', children: <UniversitiesTab /> },
          { key: 'colleges', label: 'الكليات', children: <CollegesTab /> },
          { key: 'prices', label: 'الأسعار', children: <PricesTab /> },
          { key: 'schedules', label: 'المواعيد والسعات', children: <SchedulesTab /> },
          { key: 'payments', label: 'حسابات الاستلام', children: <PaymentsTab /> },
        ]}
      />
    </Card>
  )
}

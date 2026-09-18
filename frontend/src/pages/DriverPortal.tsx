import { Card, Row, Col, Tag, Button, Empty, Segmented, Form, Select, InputNumber, Input, Upload, App as AntdApp, Table, Statistic, Modal, Descriptions, Spin } from 'antd'
import { CarOutlined, PlayCircleOutlined, CheckCircleOutlined, UploadOutlined, DollarOutlined, TeamOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { useState } from 'react'
import {
  useMyTodayQuery, useLazyDriverManifestQuery, useStartTripMutation, useCompleteTripMutation, useExpensesQuery, useCreateExpenseMutation,
} from '../app/api'
import { SHOW_SEAT_NUMBERS } from '../app/uiFlags'

const STATUS_COLOR: Record<string, string> = { planned: 'blue', started: 'orange', completed: 'green', cancelled: 'default' }
const KIND = [
  { value: 'fuel', label: 'وقود' }, { value: 'tolls', label: 'كارتات / رسوم' }, { value: 'other', label: 'مصروف آخر' },
]
const KIND_COLOR: Record<string, string> = { fuel: 'blue', tolls: 'gold', other: 'purple' }
const EXP_STATUS: Record<string, string> = { pending: 'orange', approved: 'green', rejected: 'red' }

export default function DriverPortal() {
  const { message } = AntdApp.useApp()
  const [tab, setTab] = useState('today')
  const { data: today } = useMyTodayQuery()
  const { data: myExp } = useExpensesQuery()
  const [startTrip] = useStartTripMutation()
  const [completeTrip] = useCompleteTripMutation()
  const [createExpense, { isLoading }] = useCreateExpenseMutation()
  const [fetchManifest, { data: manifest, isFetching: mLoading }] = useLazyDriverManifestQuery()
  const [manifestFor, setManifestFor] = useState<any>(null)
  const [form] = Form.useForm()
  const [file, setFile] = useState<any>(null)
  const [kind, setKind] = useState('fuel')

  const openManifest = (a: any) => { setManifestFor(a); fetchManifest(a.id) }

  const assignments = today || []
  const expenses = myExp?.results || []
  const totalApproved = expenses.filter((e: any) => e.status === 'approved').reduce((s: number, e: any) => s + Number(e.amount), 0)

  const submitExpense = async (v: any) => {
    const fd = new FormData()
    fd.append('kind', v.kind); fd.append('amount', String(v.amount))
    if (v.quantity) fd.append('quantity', String(v.quantity))
    if (v.vehicle) fd.append('vehicle', String(v.vehicle))
    if (v.description) fd.append('description', v.description)
    if (v.expense_type) fd.append('expense_type', v.expense_type)
    if (file) fd.append('receipt', file)
    try {
      await createExpense(fd).unwrap()
      message.success('تم تسجيل المصروف — بانتظار المراجعة')
      form.resetFields(); setFile(null)
    } catch (e: any) { message.error(e?.data?.detail || 'تعذر التسجيل') }
  }

  const vehicleOpts = assignments.map((a: any) => ({ value: a.vehicle, label: a.vehicle_plate }))

  return (
    <div>
      <div className="page-hero compact" style={{ marginBottom: 18 }}>
        <img src="/hero-b2.png" alt="ELKADY TRAVEL" />
        <div className="hero-bar"><span><b>بوابة السائق</b></span><span className="tag">— رحلات اليوم والمصروفات</span></div>
      </div>

      <Segmented style={{ marginBottom: 16 }} value={tab} onChange={(v) => setTab(v as string)}
        options={[{ value: 'today', label: 'رحلاتي القادمة' }, { value: 'expense', label: 'تسجيل مصروف' }, { value: 'mine', label: 'مصروفاتي' }]} />

      {tab === 'today' && (
        <Row gutter={[16, 16]}>
          {assignments.length === 0 && <Col span={24}><Empty description="لا توجد رحلات مسندة إليك حالياً" /></Col>}
          {assignments.map((a: any) => (
            <Col xs={24} md={12} key={a.id}>
              <Card style={{ borderTop: '4px solid #F07E1B' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff6ee', color: '#F07E1B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}><CarOutlined /></div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: '#0B2E5E' }}>{a.vehicle_plate}</div>
                      <div style={{ color: '#64748b', fontSize: 13 }}>{a.route_name || a.trip_label || '—'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Tag color={STATUS_COLOR[a.status]} style={{ margin: 0 }}>{a.status_display}</Tag>
                    <Tag color="blue" style={{ margin: 0 }}>{a.date}</Tag>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {a.trip_kind === 'tourism'
                    ? <Tag color="purple" style={{ alignSelf: 'center' }}>رحلة سياحية</Tag>
                    : <Button icon={<TeamOutlined />} onClick={() => openManifest(a)}>كشف الركاب</Button>}
                  {a.status === 'planned' && <Button type="primary" icon={<PlayCircleOutlined />} onClick={async () => { await startTrip(a.id).unwrap(); message.success('بدأت الرحلة') }}>بدء الرحلة</Button>}
                  {a.status === 'started' && <Button icon={<CheckCircleOutlined />} onClick={async () => { await completeTrip(a.id).unwrap(); message.success('اكتملت الرحلة') }}>إنهاء الرحلة</Button>}
                  {a.status === 'completed' && <Button type="primary" ghost icon={<DollarOutlined />} onClick={() => { setTab('expense'); form.setFieldsValue({ vehicle: a.vehicle }) }}>تسجيل مصروف</Button>}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {tab === 'expense' && (
        <Card title={<span style={{ fontWeight: 800 }}>تسجيل مصروف رحلة</span>} style={{ maxWidth: 640 }}>
          <Form form={form} layout="vertical" onFinish={submitExpense} initialValues={{ kind: 'fuel' }}>
            <Form.Item name="kind" label="نوع المصروف" rules={[{ required: true }]}>
              <Select options={KIND} onChange={setKind} />
            </Form.Item>
            <Form.Item name="vehicle" label="المركبة" rules={[{ required: true }]}>
              <Select placeholder="اختر مركبة اليوم" options={vehicleOpts} />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item name="amount" label="المبلغ (ج.م)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
              {kind === 'fuel' && <Form.Item name="quantity" label="الكمية (لتر)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>}
              {kind === 'other' && <Form.Item name="expense_type" label="نوع المصروف"><Input /></Form.Item>}
            </div>
            <Form.Item name="description" label="الوصف"><Input.TextArea rows={2} /></Form.Item>
            <Form.Item label="الإيصال (صورة/PDF)">
              <Upload beforeUpload={(f) => { setFile(f); return false }} maxCount={1} fileList={file ? [file] : []} onRemove={() => setFile(null)} accept="image/*,application/pdf">
                <Button icon={<UploadOutlined />}>رفع الإيصال</Button>
              </Upload>
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={isLoading}>تسجيل المصروف</Button>
          </Form>
        </Card>
      )}

      <Modal open={!!manifestFor} onCancel={() => setManifestFor(null)} width={780} footer={null}
        title={manifestFor ? `كشف الركاب — ${manifestFor.vehicle_plate} · ${manifestFor.route_name || manifestFor.trip_label || ''}` : ''}>
        {mLoading ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div> : manifest?.detail ? (
          <Empty description={manifest.detail} />
        ) : (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="الاتجاه">{manifest?.trip?.direction === 'return' ? 'عودة' : 'ذهاب'}</Descriptions.Item>
              <Descriptions.Item label="الرحلة">{manifest?.trip?.slot_name}</Descriptions.Item>
              <Descriptions.Item label="الوجهة">{manifest?.trip?.destination_name}</Descriptions.Item>
              <Descriptions.Item label="عدد الركاب">{manifest?.total || 0}</Descriptions.Item>
            </Descriptions>
            {(manifest?.groups || []).length === 0 && <Empty description="لا يوجد ركاب مؤكدون بعد" />}
            {(manifest?.groups || []).map((g: any) => (
              <Card key={g.pickup_id} size="small" style={{ marginBottom: 10, borderInlineStart: '4px solid #F07E1B' }}
                title={
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ClockCircleOutlined style={{ color: '#EC6A16' }} />
                    <b style={{ color: '#0B2E5E', fontSize: 16 }}>{g.time || '—'}</b>
                    <span>· {g.pickup}</span>
                    <Tag color="blue" style={{ marginInlineStart: 'auto' }}>{g.passengers.length} راكب</Tag>
                  </div>
                }>
                <Table rowKey={(r: any) => `${r.student_name}-${r.seat_number}`} size="small" pagination={false}
                  dataSource={g.passengers}
                  columns={[
                    ...(SHOW_SEAT_NUMBERS ? [{ title: 'مقعد', dataIndex: 'seat_number', width: 70, align: 'center' as const, render: (v: any) => <b>{v}</b> }] : []),
                    { title: 'الاسم', dataIndex: 'student_name' },
                    { title: 'الجامعة', dataIndex: 'university', render: (v) => v || '—' },
                    { title: 'النوع', dataIndex: 'kind', render: (v) => <Tag>{v}</Tag> },
                    { title: 'الهاتف', dataIndex: 'student_phone', render: (v) => v || '—' },
                  ]} />
              </Card>
            ))}
          </>
        )}
      </Modal>

      {tab === 'mine' && (
        <Card title={<span style={{ fontWeight: 800 }}>مصروفاتي</span>}
          extra={<Statistic title="المقبولة" value={totalApproved} suffix="ج.م" valueStyle={{ fontSize: 16 }} />}>
          <Table rowKey="id" dataSource={expenses} scroll={{ x: 'max-content' }}
            columns={[
              { title: 'النوع', dataIndex: 'kind_display', render: (v, r: any) => <Tag color={KIND_COLOR[r.kind]}>{v}</Tag> },
              { title: 'المركبة', dataIndex: 'vehicle_plate' },
              { title: 'المبلغ', dataIndex: 'amount', render: (v) => `${Number(v).toLocaleString()} ج.م` },
              { title: 'التاريخ', dataIndex: 'date' },
              { title: 'الإيصال', dataIndex: 'receipt', render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">عرض</a> : '—' },
              { title: 'الحالة', dataIndex: 'status_display', render: (v, r: any) => <Tag color={EXP_STATUS[r.status]}>{v}</Tag> },
              { title: 'ملاحظة', dataIndex: 'rejection_reason', render: (v) => v || '—' },
            ]} />
        </Card>
      )}
    </div>
  )
}

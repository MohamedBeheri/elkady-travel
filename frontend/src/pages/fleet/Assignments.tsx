import { Tag, Select, Segmented, Space } from 'antd'
import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  useAssignmentsQuery, useSaveAssignmentMutation, useDeleteAssignmentMutation, useDriversQuery, useVehicles2Query, useRoutesQuery,
  useTourismRequestsQuery,
} from '../../app/api'
import CrudCard from '../../components/CrudCard'

const STATUS = [
  { value: 'planned', label: 'مخطط' }, { value: 'started', label: 'بدأت' },
  { value: 'completed', label: 'اكتملت' }, { value: 'cancelled', label: 'ملغاة' },
]
const COLOR: Record<string, string> = { planned: 'blue', started: 'orange', completed: 'green', cancelled: 'default' }
const hhmm = (v: any) => v ? new Date(v).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''

export default function Assignments() {
  const [mode, setMode] = useState('all')       // اليوم / القادمة / الكل
  const [driver, setDriver] = useState<number>()
  // Fetch everything; filter client-side so nothing is hidden by a date picker.
  const { data, isFetching } = useAssignmentsQuery({ page_size: 2000 })
  const { data: drivers } = useDriversQuery({ status: 'active' })
  const { data: vehicles } = useVehicles2Query({ active: true })
  const { data: routes } = useRoutesQuery({ active: true })
  const { data: tourism } = useTourismRequestsQuery({ page_size: 500 })
  const [save] = useSaveAssignmentMutation()
  const [del] = useDeleteAssignmentMutation()

  const driverOpts = (drivers?.results || []).map((d: any) => ({ value: d.id, label: d.full_name }))
  const vehicleOpts = (vehicles?.results || []).map((v: any) => ({ value: v.id, label: `${v.plate_number} (${v.brand} ${v.model})` }))
  const routeOpts = (routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))
  const tourismOpts = (tourism?.results || [])
    .filter((t: any) => t.status !== 'rejected' && t.status !== 'expired')
    .map((t: any) => ({ value: t.id, label: `${t.origin} → ${t.destination} — ${t.full_name} (${t.travel_date})` }))

  const today = dayjs().format('YYYY-MM-DD')
  const rows = useMemo(() => {
    let rs = data?.results || []
    if (mode === 'today') rs = rs.filter((r: any) => r.date === today)
    else if (mode === 'upcoming') rs = rs.filter((r: any) => r.date >= today && r.status !== 'cancelled')
    if (driver) rs = rs.filter((r: any) => r.driver === driver)
    return rs
  }, [data, mode, driver, today])

  return (
    <CrudCard
      title="التعيينات اليومية (سائق ↔ مركبة)"
      rows={rows}
      loading={isFetching}
      onSave={(v) => save(v).unwrap()}
      onDelete={(id) => del(id).unwrap()}
      rowName={(r) => `تعيين ${r.date} — ${r.driver_name || ''} / ${r.vehicle_plate || ''}`}
      toolbar={
        <Space wrap>
          <Segmented value={mode} onChange={(v) => setMode(v as string)}
            options={[{ value: 'upcoming', label: 'القادمة' }, { value: 'today', label: 'اليوم' }, { value: 'all', label: 'الكل' }]} />
          <Select placeholder="كل السائقين" allowClear style={{ width: 200 }} value={driver} onChange={setDriver}
            showSearch optionFilterProp="label" options={driverOpts} />
        </Space>
      }
      columns={[
        { title: 'التاريخ', dataIndex: 'date' },
        { title: 'السائق', dataIndex: 'driver_name' },
        { title: 'المركبة', dataIndex: 'vehicle_plate' },
        { title: 'النوع', dataIndex: 'trip_kind', width: 90, render: (v: any) => v === 'tourism'
          ? <Tag color="purple">سياحية</Tag> : <Tag color="cyan">طلبة</Tag> },
        { title: 'الرحلة', dataIndex: 'trip_label', render: (v: any, r: any) => v || r.route_name || '—' },
        { title: 'الحالة', dataIndex: 'status_display', render: (v: any, r: any) => <Tag color={COLOR[r.status]}>{v}</Tag> },
        { title: 'تحرّك؟', render: (_: any, r: any) => (
          r.status === 'completed'
            ? <Tag color="green">انتهت {hhmm(r.end_time) && `· ${hhmm(r.end_time)}`}</Tag>
            : r.start_time
              ? <Tag color="orange">تحرّك · {hhmm(r.start_time)}</Tag>
              : <Tag color="default">لم يتحرك بعد</Tag>
        ) },
      ]}
      fields={[
        { name: 'date', label: 'التاريخ', type: 'date', required: true, initial: dayjs() },
        { name: 'driver', label: 'السائق', type: 'select', required: true, options: driverOpts },
        { name: 'vehicle', label: 'المركبة', type: 'select', required: true, options: vehicleOpts },
        { name: 'route', label: 'خط سير الطلبة (اختر واحداً فقط)', type: 'select', options: routeOpts },
        { name: 'tourism_request', label: 'أو رحلة سياحية', type: 'select', options: tourismOpts },
        { name: 'status', label: 'الحالة', type: 'select', options: STATUS, initial: 'planned' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
    />
  )
}

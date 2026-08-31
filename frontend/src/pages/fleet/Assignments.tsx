import { Tag, DatePicker } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import {
  useAssignmentsQuery, useSaveAssignmentMutation, useDriversQuery, useVehicles2Query, useRoutesQuery,
} from '../../app/api'
import CrudCard from '../../components/CrudCard'

const STATUS = [
  { value: 'planned', label: 'مخطط' }, { value: 'started', label: 'بدأت' },
  { value: 'completed', label: 'اكتملت' }, { value: 'cancelled', label: 'ملغاة' },
]
const COLOR: Record<string, string> = { planned: 'blue', started: 'orange', completed: 'green', cancelled: 'default' }

export default function Assignments() {
  const [date, setDate] = useState(dayjs())
  const ds = date.format('YYYY-MM-DD')
  const { data, isFetching } = useAssignmentsQuery({ date: ds, page_size: 1000 })
  const { data: drivers } = useDriversQuery({ status: 'active' })
  const { data: vehicles } = useVehicles2Query({ active: true })
  const { data: routes } = useRoutesQuery({ active: true })
  const [save] = useSaveAssignmentMutation()

  const driverOpts = (drivers?.results || []).map((d: any) => ({ value: d.id, label: d.full_name }))
  const vehicleOpts = (vehicles?.results || []).map((v: any) => ({ value: v.id, label: `${v.plate_number} (${v.brand} ${v.model})` }))
  const routeOpts = (routes?.results || []).map((r: any) => ({ value: r.id, label: r.name }))

  return (
    <CrudCard
      title="التعيينات اليومية (سائق ↔ مركبة)"
      rows={data?.results || []}
      loading={isFetching}
      onSave={(v) => save(v).unwrap()}
      toolbar={<DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} />}
      columns={[
        { title: 'التاريخ', dataIndex: 'date' },
        { title: 'السائق', dataIndex: 'driver_name' },
        { title: 'المركبة', dataIndex: 'vehicle_plate' },
        { title: 'المسار', dataIndex: 'route_name', render: (v: any) => v || '—' },
        { title: 'بداية', dataIndex: 'start_time', render: (v: any) => v ? new Date(v).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—' },
        { title: 'الحالة', dataIndex: 'status_display', render: (v: any, r: any) => <Tag color={COLOR[r.status]}>{v}</Tag> },
      ]}
      fields={[
        { name: 'date', label: 'التاريخ', type: 'date', required: true, initial: date },
        { name: 'driver', label: 'السائق', type: 'select', required: true, options: driverOpts },
        { name: 'vehicle', label: 'المركبة', type: 'select', required: true, options: vehicleOpts },
        { name: 'route', label: 'المسار', type: 'select', options: routeOpts },
        { name: 'status', label: 'الحالة', type: 'select', options: STATUS, initial: 'planned' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
    />
  )
}

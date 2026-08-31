import { Tag } from 'antd'
import { useFinesQuery, useSaveFineMutation, useVehicles2Query, useDriversQuery } from '../../app/api'
import CrudCard from '../../components/CrudCard'

export default function Fines() {
  const { data, isFetching } = useFinesQuery({ page_size: 1000 })
  const { data: vehicles } = useVehicles2Query({ active: true })
  const { data: drivers } = useDriversQuery({})
  const [save] = useSaveFineMutation()
  const vehicleOpts = (vehicles?.results || []).map((v: any) => ({ value: v.id, label: v.plate_number }))
  const driverOpts = (drivers?.results || []).map((d: any) => ({ value: d.id, label: d.full_name }))

  return (
    <CrudCard
      title="الغرامات المرورية"
      rows={data?.results || []}
      loading={isFetching}
      onSave={(v) => save(v).unwrap()}
      columns={[
        { title: 'المركبة', dataIndex: 'vehicle_plate' },
        { title: 'السائق', dataIndex: 'driver_name', render: (v: any) => v || '—' },
        { title: 'القيمة', dataIndex: 'amount', render: (v: any) => `${Number(v).toLocaleString()} ج.م` },
        { title: 'السبب', dataIndex: 'reason', render: (v: any) => v || '—' },
        { title: 'التاريخ', dataIndex: 'date' },
        { title: 'الحالة', dataIndex: 'status_display', render: (v: any, r: any) => <Tag color={r.status === 'paid' ? 'green' : 'red'}>{v}</Tag> },
      ]}
      fields={[
        { name: 'vehicle', label: 'المركبة', type: 'select', required: true, options: vehicleOpts },
        { name: 'driver', label: 'السائق (إن عُرف)', type: 'select', options: driverOpts },
        { name: 'date', label: 'التاريخ', type: 'date', required: true },
        { name: 'amount', label: 'قيمة الغرامة', type: 'number', required: true },
        { name: 'reason', label: 'سبب الغرامة' },
        { name: 'status', label: 'الحالة', type: 'select', options: [{ value: 'unpaid', label: 'غير مدفوعة' }, { value: 'paid', label: 'مدفوعة' }], initial: 'unpaid' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
    />
  )
}

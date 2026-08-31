import { Tag } from 'antd'
import { useMaintenanceQuery, useSaveMaintenanceMutation, useDeleteMaintenanceMutation, useVehicles2Query } from '../../app/api'
import CrudCard from '../../components/CrudCard'

export default function Maintenance() {
  const { data, isFetching } = useMaintenanceQuery({ page_size: 1000 })
  const { data: vehicles } = useVehicles2Query({ active: true })
  const [save] = useSaveMaintenanceMutation()
  const [del] = useDeleteMaintenanceMutation()
  const vehicleOpts = (vehicles?.results || []).map((v: any) => ({ value: v.id, label: v.plate_number }))

  return (
    <CrudCard
      title="الصيانة والورش"
      rows={data?.results || []}
      loading={isFetching}
      onSave={(v) => save(v).unwrap()}
      onDelete={(id) => del(id).unwrap()}
      rowName={(r) => `${r.vehicle_plate || ''} — ${r.maintenance_type || 'صيانة'}`}
      canEdit
      columns={[
        { title: 'المركبة', dataIndex: 'vehicle_plate' },
        { title: 'النوع', render: (_: any, r: any) => r.is_workshop ? <Tag color="volcano">ورشة</Tag> : <Tag color="cyan">صيانة</Tag> },
        { title: 'التصنيف', dataIndex: 'maintenance_type', render: (v: any) => v || '—' },
        { title: 'الورشة', dataIndex: 'workshop_name', render: (v: any) => v || '—' },
        { title: 'المبلغ', dataIndex: 'amount', render: (v: any) => `${Number(v).toLocaleString()} ج.م` },
        { title: 'التاريخ', dataIndex: 'date' },
      ]}
      fields={[
        { name: 'vehicle', label: 'المركبة', type: 'select', required: true, options: vehicleOpts },
        { name: 'date', label: 'التاريخ', type: 'date', required: true },
        { name: 'is_workshop', label: 'ورشة (بدل صيانة داخلية)', type: 'switch', initial: false },
        { name: 'maintenance_type', label: 'نوع الصيانة/الإصلاح' },
        { name: 'workshop_name', label: 'اسم الورشة (إن وجد)' },
        { name: 'amount', label: 'المبلغ', type: 'number', required: true },
        { name: 'description', label: 'الوصف', type: 'textarea' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
    />
  )
}

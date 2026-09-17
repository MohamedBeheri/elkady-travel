import { Tag, Select } from 'antd'
import { useState } from 'react'
import { useVehicles2Query, useSaveVehicleMutation, useDeleteVehicleMutation } from '../../app/api'
import CrudCard from '../../components/CrudCard'
import { usePerm } from '../../app/usePerms'

const STATUS = [
  { value: 'available', label: 'متاحة' }, { value: 'in_trip', label: 'في رحلة' },
  { value: 'maintenance', label: 'في الصيانة' }, { value: 'out_of_service', label: 'خارج الخدمة' },
  { value: 'inactive', label: 'غير نشطة' },
]
const COLOR: Record<string, string> = { available: 'green', in_trip: 'blue', maintenance: 'orange', out_of_service: 'red', inactive: 'default' }

export default function Vehicles() {
  const [status, setStatus] = useState<string>()
  const { data, isFetching } = useVehicles2Query({ status, page_size: 1000 })
  const [save] = useSaveVehicleMutation()
  const [del] = useDeleteVehicleMutation()
  const perm = usePerm('/fleet/vehicles')

  return (
    <CrudCard
      title="المركبات"
      perm={perm}
      rows={data?.results || []}
      loading={isFetching}
      onSave={(v) => save(v).unwrap()}
      onDelete={(id) => del(id).unwrap()}
      rowName={(r) => r.plate_number}
      toolbar={<Select placeholder="كل الحالات" allowClear style={{ width: 180 }} value={status} onChange={setStatus} options={STATUS} />}
      columns={[
        { title: 'رقم اللوحة', dataIndex: 'plate_number' },
        { title: 'الماركة/الموديل', render: (_: any, r: any) => `${r.brand || ''} ${r.model || ''}`.trim() || '—' },
        { title: 'النوع', dataIndex: 'vehicle_type', render: (v: any) => v || '—' },
        { title: 'السعة', dataIndex: 'capacity', render: (v: any) => v || '—' },
        { title: 'انتهاء الرخصة', dataIndex: 'license_expiry', render: (v: any) => v || '—' },
        { title: 'الحالة', dataIndex: 'status_display', render: (v: any, r: any) => <Tag color={COLOR[r.status]}>{v}</Tag> },
      ]}
      fields={[
        { name: 'plate_number', label: 'رقم اللوحة', required: true },
        { name: 'vehicle_type', label: 'نوع المركبة' },
        { name: 'brand', label: 'الماركة' },
        { name: 'model', label: 'الموديل' },
        { name: 'year', label: 'سنة الصنع', type: 'number' },
        { name: 'capacity', label: 'السعة', type: 'number' },
        { name: 'license_number', label: 'رقم الرخصة' },
        { name: 'license_expiry', label: 'انتهاء رخصة المركبة', type: 'date' },
        { name: 'status', label: 'الحالة', type: 'select', options: STATUS, initial: 'available' },
        { name: 'active', label: 'نشطة', type: 'switch', initial: true },
        { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      ]}
    />
  )
}

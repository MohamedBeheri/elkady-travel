import { Tag, Select, Alert } from 'antd'
import { useState } from 'react'
import { useDriversQuery, useSaveDriverMutation, useDeleteDriverMutation, useDriverAlertsQuery } from '../../app/api'
import CrudCard from '../../components/CrudCard'

const STATUS = [
  { value: 'active', label: 'نشط' }, { value: 'inactive', label: 'غير نشط' }, { value: 'suspended', label: 'موقوف' },
]
const LICENSE = [
  { value: 'first', label: 'أولى' }, { value: 'second', label: 'ثانية' },
  { value: 'third', label: 'ثالثة' }, { value: 'private', label: 'خاصة' },
]
const COLOR: Record<string, string> = { active: 'green', inactive: 'default', suspended: 'red' }

export default function Drivers() {
  const [status, setStatus] = useState<string>()
  const { data, isFetching } = useDriversQuery({ status, page_size: 1000 })
  const { data: alerts } = useDriverAlertsQuery()
  const [save] = useSaveDriverMutation()
  const [del] = useDeleteDriverMutation()

  return (
    <div>
      {(alerts?.length ?? 0) > 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 14 }}
          message={`تنبيه: رخص ${alerts.length} سائق على وشك الانتهاء`}
          description={alerts.map((d: any) => `${d.full_name} (${d.license_expiry})`).join('، ')} />
      )}
      <CrudCard
        title="السائقون"
        rows={data?.results || []}
        loading={isFetching}
        onSave={(v) => save(v).unwrap()}
        onDelete={(id) => del(id).unwrap()}
        rowName={(r) => r.full_name}
        toolbar={<Select placeholder="كل الحالات" allowClear style={{ width: 180 }} value={status} onChange={setStatus} options={STATUS} />}
        columns={[
          { title: 'الاسم', dataIndex: 'full_name' },
          { title: 'الهاتف', dataIndex: 'phone', render: (v: any) => v || '—' },
          { title: 'رقم الرخصة', dataIndex: 'license_number', render: (v: any) => v || '—' },
          { title: 'نوع الرخصة', dataIndex: 'license_type_display', render: (v: any) => v || '—' },
          { title: 'انتهاء الرخصة', dataIndex: 'license_expiry', render: (v: any) => v || '—' },
          { title: 'الحالة', dataIndex: 'status_display', render: (v: any, r: any) => <Tag color={COLOR[r.status]}>{v}</Tag> },
        ]}
        fields={[
          { name: 'full_name', label: 'الاسم', required: true },
          { name: 'phone', label: 'رقم الهاتف' },
          { name: 'license_number', label: 'رقم الرخصة' },
          { name: 'license_type', label: 'نوع الرخصة', type: 'select', options: LICENSE },
          { name: 'license_expiry', label: 'انتهاء الرخصة', type: 'date' },
          { name: 'status', label: 'الحالة', type: 'select', options: STATUS, initial: 'active' },
          { name: 'notes', label: 'ملاحظات', type: 'textarea' },
        ]}
      />
    </div>
  )
}

import { Card, Segmented, Table, Checkbox, Button, App as AntdApp, Tag, Alert } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { usePermissionsMatrixQuery, useSavePermissionsMutation, useMeQuery } from '../app/api'
import { useAppDispatch } from '../app/store'
import { setUser } from '../app/authSlice'

type Flags = { view: boolean; add: boolean; edit: boolean; delete: boolean }

export default function Permissions() {
  const { message } = AntdApp.useApp()
  const { data, isFetching } = usePermissionsMatrixQuery()
  const [save, { isLoading }] = useSavePermissionsMutation()
  const dispatch = useAppDispatch()
  const { refetch: refetchMe } = useMeQuery()

  const [role, setRole] = useState<string>()
  // Local editable copy of the whole matrix: { role: { screen: Flags } }
  const [matrix, setMatrix] = useState<Record<string, Record<string, Flags>>>({})

  useEffect(() => {
    if (data?.matrix) {
      setMatrix(JSON.parse(JSON.stringify(data.matrix)))
      if (!role && data.roles?.length) setRole(data.roles[0].key)
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const screens = data?.screens || []
  const roles = data?.roles || []

  const rows = useMemo(() => screens.map((s: any) => ({ ...s, flags: matrix[role || '']?.[s.key] })), [screens, matrix, role])

  const set = (screen: string, field: keyof Flags, val: boolean) => {
    setMatrix((m) => {
      const next = { ...m, [role!]: { ...(m[role!] || {}) } }
      const cur = { ...(next[role!][screen] || { view: false, add: false, edit: false, delete: false }) }
      cur[field] = val
      // Turning off view removes the screen entirely; turning on add/edit/delete implies view.
      if (field === 'view' && !val) { cur.add = false; cur.edit = false; cur.delete = false }
      if (field !== 'view' && val) cur.view = true
      next[role!][screen] = cur
      return next
    })
  }

  const setAll = (screen: string, val: boolean) => {
    setMatrix((m) => ({ ...m, [role!]: { ...(m[role!] || {}), [screen]: { view: val, add: val, edit: val, delete: val } } }))
  }

  const onSave = async () => {
    const items: any[] = []
    Object.entries(matrix).forEach(([r, screensObj]) => {
      Object.entries(screensObj).forEach(([screen, f]) => {
        items.push({ role: r, screen, view: f.view, add: f.add, edit: f.edit, delete: f.delete })
      })
    })
    try {
      await save({ items }).unwrap()
      // Refresh my own permissions in case the admin changed their view (harmless).
      const me = await refetchMe().unwrap()
      if (me) dispatch(setUser(me))
      message.success('تم حفظ الصلاحيات — ستظهر للمستخدمين عند تحديث دخولهم')
    } catch (e: any) { message.error(e?.data?.detail || 'تعذّر الحفظ') }
  }

  const cbCol = (field: keyof Flags, title: string) => ({
    title, width: 90, align: 'center' as const,
    render: (_: any, r: any) => (
      <Checkbox checked={!!r.flags?.[field]} onChange={(e) => set(r.key, field, e.target.checked)} />
    ),
  })

  return (
    <Card
      title={<span style={{ fontWeight: 800 }}>صلاحيات الأدوار — الشاشات والإجراءات</span>}
      extra={<Button type="primary" loading={isLoading} onClick={onSave}>حفظ الصلاحيات</Button>}
    >
      <Alert type="info" showIcon style={{ marginBottom: 14 }}
        message="المدير العام له كل الصلاحيات دائماً. اختر الدور ثم حدّد الشاشات المسموحة وإجراءات (عرض/إضافة/تعديل/حذف)."
        description="إلغاء «عرض» يخفي الشاشة كلياً عن الدور. تفعيل أي إجراء يفعّل «عرض» تلقائياً." />

      <Segmented
        style={{ marginBottom: 16 }} value={role} onChange={(v) => setRole(v as string)}
        options={roles.map((r: any) => ({ value: r.key, label: r.label }))} />

      <Table
        rowKey="key" loading={isFetching} dataSource={rows} pagination={false} size="small"
        scroll={{ x: 640 }}
        columns={[
          { title: 'المجموعة', dataIndex: 'group', width: 110, render: (v) => <Tag>{v}</Tag> },
          { title: 'الشاشة', dataIndex: 'label' },
          cbCol('view', 'عرض'),
          cbCol('add', 'إضافة'),
          cbCol('edit', 'تعديل'),
          cbCol('delete', 'حذف'),
          { title: 'الكل', width: 100, align: 'center',
            render: (_: any, r: any) => {
              const all = r.flags?.view && r.flags?.add && r.flags?.edit && r.flags?.delete
              return <Button size="small" onClick={() => setAll(r.key, !all)}>{all ? 'إلغاء' : 'تحديد الكل'}</Button>
            } },
        ]}
      />
    </Card>
  )
}

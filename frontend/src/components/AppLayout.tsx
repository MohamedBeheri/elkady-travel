import { Layout, Menu, Avatar, Dropdown, Badge, Popover, List, Tag, Button, Grid, Drawer } from 'antd'
import {
  DashboardOutlined, DollarOutlined, TeamOutlined, ClockCircleOutlined,
  CarOutlined, RollbackOutlined, SettingOutlined, CompassOutlined,
  UserOutlined, LogoutOutlined, BellOutlined, IdcardOutlined, MenuOutlined,
  ToolOutlined, WarningOutlined, BarChartOutlined, AuditOutlined, ProfileOutlined, SafetyOutlined,
  ApartmentOutlined, SwapOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/store'
import { logout } from '../app/authSlice'
import { useUnreadNotificationsQuery, useMarkAllReadMutation, useCompanyQuery } from '../app/api'
import Logo from './Logo'
import KaffoCredit from './KaffoCredit'

const { Header, Sider, Content } = Layout
const STAFF = ['admin', 'transport_manager', 'payment_officer', 'operations', 'tourism_manager']

const SEV: Record<string, string> = { info: 'blue', success: 'green', warning: 'orange', error: 'red' }

function Bell() {
  const navigate = useNavigate()
  const { data } = useUnreadNotificationsQuery(undefined, { pollingInterval: 30000 })
  const [markAll] = useMarkAllReadMutation()
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      title={<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>الإشعارات</span>
        <a onClick={() => markAll()}>تعليم الكل كمقروء</a>
      </div>}
      content={
        <List
          size="small"
          style={{ width: 320, maxHeight: 360, overflowY: 'auto' }}
          dataSource={data?.items || []}
          locale={{ emptyText: 'لا توجد إشعارات' }}
          renderItem={(a: any) => (
            <List.Item style={{ cursor: a.link ? 'pointer' : 'default' }} onClick={() => a.link && navigate(a.link)}>
              <List.Item.Meta
                title={<Tag color={SEV[a.severity]}>{a.title}</Tag>}
                description={a.message}
              />
            </List.Item>
          )}
        />
      }
    >
      <Badge count={data?.count || 0} size="small">
        <BellOutlined style={{ fontSize: 19, cursor: 'pointer', color: '#fff' }} />
      </Badge>
    </Popover>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const user = useAppSelector((s) => s.auth.user)
  const { data: company } = useCompanyQuery()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.lg
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isStaff = STAFF.includes(user?.role || '')

  const role = user?.role || ''
  const isAdmin = role === 'admin'
  // Dynamic per-role screen permissions (admin sees everything).
  const perms = user?.permissions || {}
  const canView = (k: string) => isAdmin || !!perms[k]?.view

  // Full menu; leaves are filtered by view permission, empty groups dropped.
  const rawItems: any[] = [
    { key: '/', icon: <DashboardOutlined />, label: 'لوحة التحكم' },
    {
      key: 'g-ops', icon: <CarOutlined />, label: 'التشغيل', children: [
        { key: '/operations', icon: <DashboardOutlined />, label: 'لوحة المشرف' },
        { key: '/board', icon: <CarOutlined />, label: 'رحلات الغد' },
        { key: '/day-manifest', icon: <ProfileOutlined />, label: 'كشف اليوم الشامل' },
        { key: '/reschedules', icon: <SwapOutlined />, label: 'طلبات التأجيل' },
        { key: '/subscriptions', icon: <TeamOutlined />, label: 'الطلاب والاشتراكات' },
        { key: '/waiting', icon: <ClockCircleOutlined />, label: 'قوائم الانتظار' },
        // Hidden from the menu — كشف اليوم الشامل now covers this, and the
        // separate ReturnBooking system it reads from has no real usage.
        // Page/route/backend left intact; still reachable at /returns directly.
        { key: '/payments', icon: <DollarOutlined />, label: 'تأكيد المدفوعات' },
        { key: '/tourism', icon: <CompassOutlined />, label: 'السياحة والرحلات' },
      ],
    },
    {
      key: 'g-fleet', icon: <ApartmentOutlined />, label: 'الأسطول', children: [
        { key: '/fleet/vehicles', icon: <CarOutlined />, label: 'المركبات' },
        { key: '/fleet/drivers', icon: <IdcardOutlined />, label: 'السائقون' },
        { key: '/fleet/assignments', icon: <ProfileOutlined />, label: 'التعيينات اليومية' },
      ],
    },
    {
      key: 'g-exp', icon: <DollarOutlined />, label: 'المصروفات', children: [
        { key: '/fleet/expenses', icon: <DollarOutlined />, label: 'مصروفات الرحلات' },
        { key: '/fleet/maintenance', icon: <ToolOutlined />, label: 'الصيانة والورش' },
        { key: '/fleet/fines', icon: <WarningOutlined />, label: 'الغرامات المرورية' },
      ],
    },
    {
      key: 'g-rep', icon: <BarChartOutlined />, label: 'التقارير', children: [
        { key: '/reports/finance', icon: <DollarOutlined />, label: 'التقارير المالية' },
        { key: '/fleet/reports', icon: <BarChartOutlined />, label: 'مصروفات المركبات' },
        { key: '/fleet/trip-cost', icon: <DollarOutlined />, label: 'تكلفة الرحلات' },
      ],
    },
    {
      key: 'g-sys', icon: <SettingOutlined />, label: 'النظام', children: [
        { key: '/config', icon: <SettingOutlined />, label: 'الإعدادات والتهيئة' },
        { key: '/users', icon: <IdcardOutlined />, label: 'المستخدمون' },
        { key: '/fleet/audit', icon: <AuditOutlined />, label: 'سجل التدقيق' },
        // Permissions management is admin-only (governs everyone else's access).
        ...(isAdmin ? [{ key: '/permissions', icon: <SafetyOutlined />, label: 'صلاحيات الأدوار' }] : []),
      ],
    },
  ]

  const items = rawItems
    .map((it) => {
      if (!it.children) return canView(it.key) ? it : null
      const kids = it.children.filter((c: any) => c.key === '/permissions' || canView(c.key))
      return kids.length ? { ...it, children: kids } : null
    })
    .filter(Boolean) as any[]

  const allKeys = items.flatMap((i: any) => [i.key, ...(i.children || []).map((c: any) => c.key)]).filter((k: string) => k.startsWith('/'))
  const selectedKey = allKeys.filter((k: string) => k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)).sort((a: string, b: string) => b.length - a.length)[0] || '/'
  const openKeys = items.filter((i: any) => (i.children || []).some((c: any) => c.key === selectedKey)).map((i: any) => i.key)

  const brand = (compact = false) => (
    <div style={{ padding: '18px 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 11 }}>
      <Logo size={compact ? 40 : 46} className="sidebar-logo" />
      {(!collapsed || compact) && <div style={{ lineHeight: 1.25 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>القاضي</div>
        <div style={{ fontSize: 11, color: '#F5A44E', fontWeight: 800, letterSpacing: 1.5 }}>ELKADY TRAVEL</div>
      </div>}
    </div>
  )
  const menu = (onNavigate?: () => void) => (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={openKeys}
      items={items}
      onClick={({ key }) => { if (String(key).startsWith('/')) { navigate(key); onNavigate?.() } }}
    />
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          theme="dark"
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          collapsedWidth={80}
          width={240}
          style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {brand()}
            {/* scrollable menu area — prevents a long menu from spilling out of the sidebar */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 48 }}>
              {menu()}
            </div>
          </div>
        </Sider>
      )}

      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff', padding: isMobile ? '0 12px' : '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} style={{ color: '#fff' }} />}
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isStaff ? 'بوابة الإدارة' : 'بوابة الطالب'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Bell />
            <Dropdown
              menu={{ items: [
                { key: 'logout', icon: <LogoutOutlined />, label: 'تسجيل الخروج', onClick: () => { dispatch(logout()); navigate('/login') } },
              ] }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar style={{ background: '#0e7490' }} icon={<UserOutlined />} size="small" />
                {screens.sm && <span style={{ color: '#fff', whiteSpace: 'nowrap' }}>{user?.full_name || user?.username}</span>}
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: screens.md ? 24 : 12, minWidth: 0 }}>
          <Outlet />
        </Content>
        <div style={{ padding: '14px 12px 20px' }}>
          <KaffoCredit />
        </div>
      </Layout>

      {isMobile && (
        <Drawer
          placement="right"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={260}
          closable={false}
          styles={{ body: { padding: 0, background: '#001529', display: 'flex', flexDirection: 'column' }, header: { display: 'none' } }}
        >
          {brand(true)}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            {menu(() => setDrawerOpen(false))}
          </div>
        </Drawer>
      )}
    </Layout>
  )
}

import { Layout, Menu, Avatar, Dropdown, Badge, Popover, List, Tag, Button, Grid } from 'antd'
import {
  DashboardOutlined, DollarOutlined, TeamOutlined, ClockCircleOutlined,
  CarOutlined, RollbackOutlined, SettingOutlined, CompassOutlined,
  UserOutlined, LogoutOutlined, BellOutlined, IdcardOutlined, MenuOutlined,
  ToolOutlined, WarningOutlined, BarChartOutlined, AuditOutlined, ProfileOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../app/store'
import { logout } from '../app/authSlice'
import { useUnreadNotificationsQuery, useMarkAllReadMutation, useCompanyQuery } from '../app/api'
import Logo from './Logo'

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
  const [collapsed, setCollapsed] = useState(false)
  const isStaff = STAFF.includes(user?.role || '')

  const role = user?.role || ''
  const isAdmin = role === 'admin'
  const isFleet = ['admin', 'bus_supervisor', 'transport_manager', 'operations'].includes(role)

  const items: any[] = [
    { key: '/', icon: <DashboardOutlined />, label: 'لوحة التحكم' },
    {
      key: 'g-ops', icon: <CarOutlined />, label: 'التشغيل', children: [
        { key: '/board', icon: <CarOutlined />, label: 'رحلات الغد' },
        { key: '/subscriptions', icon: <TeamOutlined />, label: 'الطلاب والاشتراكات' },
        { key: '/waiting', icon: <ClockCircleOutlined />, label: 'قوائم الانتظار' },
        { key: '/returns', icon: <RollbackOutlined />, label: 'رحلات العودة' },
        { key: '/payments', icon: <DollarOutlined />, label: 'تأكيد المدفوعات' },
        { key: '/tourism', icon: <CompassOutlined />, label: 'السياحة والرحلات' },
      ],
    },
    ...(isFleet ? [{
      key: 'g-fleet', icon: <ApartmentOutlined />, label: 'الأسطول', children: [
        { key: '/fleet/vehicles', icon: <CarOutlined />, label: 'المركبات' },
        { key: '/fleet/drivers', icon: <IdcardOutlined />, label: 'السائقون' },
        { key: '/fleet/assignments', icon: <ProfileOutlined />, label: 'التعيينات اليومية' },
      ],
    }, {
      key: 'g-exp', icon: <DollarOutlined />, label: 'المصروفات', children: [
        { key: '/fleet/expenses', icon: <DollarOutlined />, label: 'مصروفات الرحلات' },
        { key: '/fleet/maintenance', icon: <ToolOutlined />, label: 'الصيانة والورش' },
        { key: '/fleet/fines', icon: <WarningOutlined />, label: 'الغرامات المرورية' },
      ],
    }, {
      key: 'g-rep', icon: <BarChartOutlined />, label: 'التقارير', children: [
        { key: '/fleet/reports', icon: <BarChartOutlined />, label: 'مصروفات المركبات' },
      ],
    }] : []),
    ...(isAdmin ? [{
      key: 'g-sys', icon: <SettingOutlined />, label: 'النظام', children: [
        { key: '/config', icon: <SettingOutlined />, label: 'الإعدادات والتهيئة' },
        { key: '/users', icon: <IdcardOutlined />, label: 'المستخدمون' },
        { key: '/fleet/audit', icon: <AuditOutlined />, label: 'سجل التدقيق' },
      ],
    }] : []),
  ]

  const allKeys = items.flatMap((i: any) => [i.key, ...(i.children || []).map((c: any) => c.key)]).filter((k: string) => k.startsWith('/'))
  const selectedKey = allKeys.filter((k: string) => k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)).sort((a: string, b: string) => b.length - a.length)[0] || '/'
  const openKeys = items.filter((i: any) => (i.children || []).some((c: any) => c.key === selectedKey)).map((i: any) => i.key)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="dark"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={screens.lg ? 80 : 0}
        width={240}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div style={{ padding: '18px 14px', color: '#fff', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Logo size={46} className="sidebar-logo" />
          {!collapsed && <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>القاضي</div>
            <div style={{ fontSize: 11, color: '#F5A44E', fontWeight: 800, letterSpacing: 1.5 }}>ELKADY TRAVEL</div>
          </div>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={items}
          onClick={({ key }) => { if (String(key).startsWith('/')) navigate(key) }}
        />
      </Sider>

      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!screens.lg && <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(!collapsed)} style={{ color: '#fff' }} />}
            <span style={{ fontWeight: 600 }}>{isStaff ? 'بوابة الإدارة' : 'بوابة الطالب'}</span>
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
                <span style={{ color: '#fff' }}>{user?.full_name || user?.username}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: screens.md ? 24 : 12 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

import { Layout, Menu, Avatar, Dropdown, Badge, Popover, List, Tag, Button, Grid } from 'antd'
import {
  DashboardOutlined, DollarOutlined, TeamOutlined, ClockCircleOutlined,
  CarOutlined, RollbackOutlined, SettingOutlined, CompassOutlined,
  UserOutlined, LogoutOutlined, BellOutlined, HomeOutlined, ScheduleOutlined,
  HistoryOutlined, IdcardOutlined, MenuOutlined, QrcodeOutlined,
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

  const staffItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'لوحة التحكم' },
    { key: '/payments', icon: <DollarOutlined />, label: 'تأكيد المدفوعات' },
    { key: '/subscriptions', icon: <TeamOutlined />, label: 'الطلاب والاشتراكات' },
    { key: '/waiting', icon: <ClockCircleOutlined />, label: 'قوائم الانتظار' },
    { key: '/board', icon: <CarOutlined />, label: 'رحلات الغد' },
    { key: '/returns', icon: <RollbackOutlined />, label: 'رحلات العودة' },
    { key: '/tourism', icon: <CompassOutlined />, label: 'السياحة والرحلات' },
    ...(user?.role === 'admin' ? [
      { key: '/config', icon: <SettingOutlined />, label: 'الإعدادات والتهيئة' },
      { key: '/users', icon: <IdcardOutlined />, label: 'المستخدمون' },
    ] : []),
  ]

  const studentItems = [
    { key: '/', icon: <HomeOutlined />, label: 'الرئيسية' },
    { key: '/book', icon: <ScheduleOutlined />, label: 'حجز اشتراك' },
    { key: '/my-bookings', icon: <HistoryOutlined />, label: 'حجوزاتي والدفع' },
    { key: '/daily', icon: <CarOutlined />, label: 'حجز رحلة يومية' },
    { key: '/tickets', icon: <QrcodeOutlined />, label: 'تذاكري و QR' },
    { key: '/return', icon: <RollbackOutlined />, label: 'رحلة العودة' },
    { key: '/tourism', icon: <CompassOutlined />, label: 'رحلة سياحية' },
    { key: '/profile', icon: <UserOutlined />, label: 'ملفي الشخصي' },
  ]

  const items = isStaff ? staffItems : studentItems
  const selectedKey = items.map((i) => i.key).filter((k) => k === '/' ? location.pathname === '/' : location.pathname.startsWith(k)).sort((a, b) => b.length - a.length)[0] || '/'

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
          items={items}
          onClick={({ key }) => navigate(key)}
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

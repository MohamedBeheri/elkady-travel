import { Button, Dropdown, Grid } from 'antd'
import {
  LoginOutlined, UserAddOutlined, UserOutlined, LogoutOutlined, MenuOutlined,
  HomeOutlined, CarOutlined, QrcodeOutlined,
  DollarOutlined, IdcardOutlined,
} from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../app/store'
import { logout } from '../app/authSlice'

const STUDENT_NAV = [
  { to: '/', label: 'احجز رحلتك', icon: <CarOutlined /> },
  { to: '/explore', label: 'استكشف الخطوط', icon: <HomeOutlined /> },
  { to: '/my-bookings', label: 'حجوزاتي والدفع', icon: <DollarOutlined /> },
  { to: '/tickets', label: 'تذاكري', icon: <QrcodeOutlined /> },
  { to: '/profile', label: 'ملفي', icon: <IdcardOutlined /> },
]

export default function SiteLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const user = useAppSelector((s) => s.auth.user)
  const screens = Grid.useBreakpoint()
  const isStudent = user?.role === 'student'
  const nav = isStudent ? STUDENT_NAV : []

  const NavLinks = ({ vertical = false }: { vertical?: boolean }) => (
    <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 4 : 4, alignItems: vertical ? 'stretch' : 'center' }}>
      {nav.map((n) => {
        const active = n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
        return (
          <button key={n.to} onClick={() => navigate(n.to)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              background: active ? '#F07E1B' : 'transparent', color: '#fff',
              border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700,
              fontSize: 14, fontFamily: 'inherit', width: vertical ? '100%' : 'auto',
              justifyContent: vertical ? 'flex-start' : 'center',
            }}>
            {n.icon} {n.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#eef2f8', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#0B2E5E', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img src="/logo.png" alt="القاضي" style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff' }} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>القاضي</div>
            <div style={{ fontSize: 10, color: '#F5A44E', fontWeight: 700, letterSpacing: 1 }}>ELKADY TRAVEL</div>
          </div>
        </div>

        {/* desktop nav */}
        {isStudent && screens.lg && <NavLinks />}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {user ? (
            <>
              {isStudent && !screens.lg && (
                <Dropdown trigger={['click']} menu={{ items: nav.map((n) => ({ key: n.to, icon: n.icon, label: n.label, onClick: () => navigate(n.to) })) }}>
                  <Button icon={<MenuOutlined />} ghost />
                </Dropdown>
              )}
              <Dropdown trigger={['click']} menu={{ items: [
                { key: 'profile', icon: <IdcardOutlined />, label: 'ملفي الشخصي', onClick: () => navigate('/profile') },
                { key: 'logout', icon: <LogoutOutlined />, label: 'تسجيل الخروج', onClick: () => { dispatch(logout()); navigate('/') } },
              ] }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F07E1B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserOutlined /></span>
                  {screens.sm && <span style={{ fontWeight: 700 }}>{user.full_name || user.username}</span>}
                </div>
              </Dropdown>
            </>
          ) : (
            <>
              <Button icon={<LoginOutlined />} onClick={() => navigate('/login')} ghost>دخول</Button>
              <Button icon={<UserAddOutlined />} type="primary" onClick={() => navigate('/register')}>حساب جديد</Button>
            </>
          )}
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 1180, width: '100%', margin: '0 auto', padding: '18px 16px 40px' }}>
        <Outlet />
      </main>

      <footer style={{ background: '#0a2242', color: '#cdd8ea', textAlign: 'center', padding: '16px', fontSize: 13 }}>
        القاضي — ELKADY TRAVEL · جميع الحقوق محفوظة
      </footer>
    </div>
  )
}

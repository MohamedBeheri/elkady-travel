import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppSelector } from './app/store'
import AppLayout from './components/AppLayout'
import SiteLayout from './components/SiteLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Explore from './pages/Explore'
// student
import Book from './pages/Book'
import MyBookings from './pages/MyBookings'
import Tickets from './pages/Tickets'
import Attendance from './pages/Attendance'
import Profile from './pages/Profile'
// admin
import Dashboard from './pages/Dashboard'
import PaymentQueue from './pages/PaymentQueue'
import Subscriptions from './pages/Subscriptions'
import WaitingLists from './pages/WaitingLists'
import TripBoard from './pages/TripBoard'
import ReturnLists from './pages/ReturnLists'
import Config from './pages/Config'
import TourismAdmin from './pages/TourismAdmin'
import Users from './pages/Users'
import FinanceReports from './pages/FinanceReports'
// fleet (admin)
import Vehicles from './pages/fleet/Vehicles'
import Drivers from './pages/fleet/Drivers'
import Assignments from './pages/fleet/Assignments'
import Expenses from './pages/fleet/Expenses'
import Maintenance from './pages/fleet/Maintenance'
import Fines from './pages/fleet/Fines'
import FleetReports from './pages/fleet/FleetReports'
import TripCost from './pages/fleet/TripCost'
import OperationsDashboard from './pages/fleet/OperationsDashboard'
import AuditLogs from './pages/fleet/AuditLogs'
// driver
import DriverPortal from './pages/DriverPortal'

const STAFF = ['admin', 'transport_manager', 'payment_officer', 'operations', 'bus_supervisor', 'tourism_manager']

export default function App() {
  const access = useAppSelector((s) => s.auth.access)
  const user = useAppSelector((s) => s.auth.user)

  // ---- Public visitor (not logged in): the external site + auth screens ----
  if (!access || !user) {
    return (
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<Explore />} />
          <Route path="/explore" element={<Explore />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  // ---- Staff: admin dashboard with sidebar ----
  if (STAFF.includes(user.role)) {
    return (
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/payments" element={<PaymentQueue />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/waiting" element={<WaitingLists />} />
          <Route path="/board" element={<TripBoard />} />
          <Route path="/returns" element={<ReturnLists />} />
          <Route path="/config" element={<Config />} />
          <Route path="/tourism" element={<TourismAdmin />} />
          <Route path="/users" element={<Users />} />
          <Route path="/reports/finance" element={<FinanceReports />} />
          {/* Fleet management */}
          <Route path="/fleet/vehicles" element={<Vehicles />} />
          <Route path="/fleet/drivers" element={<Drivers />} />
          <Route path="/fleet/assignments" element={<Assignments />} />
          <Route path="/fleet/expenses" element={<Expenses />} />
          <Route path="/fleet/maintenance" element={<Maintenance />} />
          <Route path="/fleet/fines" element={<Fines />} />
          <Route path="/fleet/reports" element={<FleetReports />} />
          <Route path="/fleet/trip-cost" element={<TripCost />} />
          <Route path="/operations" element={<OperationsDashboard />} />
          <Route path="/fleet/audit" element={<AuditLogs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  // ---- Driver: own portal inside the site shell ----
  if (user.role === 'driver') {
    return (
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<DriverPortal />} />
          <Route path="/driver" element={<DriverPortal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }

  // ---- Student: the SAME external site (top-nav), no sidebar dashboard ----
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Book />} />
        <Route path="/book" element={<Navigate to="/" replace />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/daily" element={<Navigate to="/" replace />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/return" element={<Navigate to="/attendance" replace />} />
        <Route path="/tourism" element={<Navigate to="/" replace />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

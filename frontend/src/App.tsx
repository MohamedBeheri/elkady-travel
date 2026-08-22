import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppSelector } from './app/store'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Register from './pages/Register'
import Explore from './pages/Explore'
// student
import StudentHome from './pages/StudentHome'
import BookSubscription from './pages/BookSubscription'
import MyBookings from './pages/MyBookings'
import DailyBooking from './pages/DailyBooking'
import Tickets from './pages/Tickets'
import ReturnTrip from './pages/ReturnTrip'
import TourismRequest from './pages/TourismRequest'
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

const STAFF = ['admin', 'transport_manager', 'payment_officer', 'operations', 'tourism_manager']

export default function App() {
  const access = useAppSelector((s) => s.auth.access)
  const user = useAppSelector((s) => s.auth.user)

  if (!access || !user) {
    return (
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  const isStaff = STAFF.includes(user.role)

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {isStaff ? (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/payments" element={<PaymentQueue />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/waiting" element={<WaitingLists />} />
            <Route path="/board" element={<TripBoard />} />
            <Route path="/returns" element={<ReturnLists />} />
            <Route path="/config" element={<Config />} />
            <Route path="/tourism" element={<TourismAdmin />} />
            <Route path="/users" element={<Users />} />
          </>
        ) : (
          <>
            <Route path="/" element={<StudentHome />} />
            <Route path="/book" element={<BookSubscription />} />
            <Route path="/my-bookings" element={<MyBookings />} />
            <Route path="/daily" element={<DailyBooking />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/return" element={<ReturnTrip />} />
            <Route path="/tourism" element={<TourismRequest />} />
            <Route path="/profile" element={<Profile />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

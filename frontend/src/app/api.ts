import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { RootState } from './store'

const baseQuery = fetchBaseQuery({
  baseUrl: '/api/',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.access
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

// Helper: build a query string from a params object.
const qs = (params?: Record<string, any>) => {
  if (!params) return ''
  const clean = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  return clean.length ? '?' + new URLSearchParams(clean as any).toString() : ''
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: [
    'User', 'Route', 'University', 'College', 'Destination', 'Pickup', 'Slot', 'ReturnSlot',
    'Capacity', 'Price', 'PayMethod', 'PayAccount', 'Company',
    'Subscription', 'DailyTrip', 'SeatRequest', 'ReturnBooking', 'SeatMap', 'Ticket', 'Attendance', 'PickupTime',
    'Tourism', 'Quotation', 'Vehicle', 'Notification', 'Dashboard',
    'FVehicle', 'FDriver', 'Assignment', 'Expense', 'Maintenance', 'Fine', 'Audit', 'FleetDash',
    'Permissions',
  ],
  endpoints: (b) => ({
    // ---- auth ----
    login: b.mutation<any, { username: string; password: string }>({
      query: (body) => ({ url: 'auth/login/', method: 'POST', body }),
    }),
    register: b.mutation<any, any>({
      query: (body) => ({ url: 'auth/register/', method: 'POST', body }),
    }),
    passwordResetLookup: b.mutation<any, { identifier: string }>({
      query: (body) => ({ url: 'auth/password-reset/lookup/', method: 'POST', body }),
    }),
    resetStudentPassword: b.mutation<any, any>({
      query: (body) => ({ url: 'auth/password-reset/', method: 'POST', body }),
    }),
    adminResetUserPassword: b.mutation<any, { id: number; password: string }>({
      query: ({ id, password }) => ({ url: `auth/users/${id}/reset-password/`, method: 'POST', body: { password } }),
      invalidatesTags: ['User'],
    }),
    me: b.query<any, void>({ query: () => 'auth/users/me/', providesTags: ['User'] }),
    updateProfile: b.mutation<any, any>({
      query: (body) => ({ url: 'auth/users/update-profile/', method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    users: b.query<any, Record<string, any> | void>({
      query: (p) => `auth/users/${qs(p as any)}`, providesTags: ['User'],
    }),
    saveUser: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `auth/users/${id}/` : 'auth/users/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['User'],
    }),
    deleteUser: b.mutation<any, number>({
      query: (id) => ({ url: `auth/users/${id}/`, method: 'DELETE' }), invalidatesTags: ['User'],
    }),
    permissionsMatrix: b.query<any, void>({ query: () => 'config/permissions/', providesTags: ['Permissions'] }),
    savePermissions: b.mutation<any, { items: any[] }>({
      query: (body) => ({ url: 'config/permissions/', method: 'POST', body }),
      invalidatesTags: ['Permissions', 'User'],
    }),

    // ---- dashboard ----
    dashboard: b.query<any, void>({ query: () => 'dashboard/stats/', providesTags: ['Dashboard'] }),
    dashboardCharts: b.query<any, void>({ query: () => 'dashboard/charts/', providesTags: ['Dashboard'] }),
    financeReport: b.query<any, { start?: string; end?: string; month?: string } | void>({
      query: (p) => {
        const q = new URLSearchParams()
        if (p?.start) q.set('start', p.start)
        if (p?.end) q.set('end', p.end)
        if (p?.month) q.set('month', p.month)
        const qs = q.toString()
        return `reports/finance/${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Dashboard'],
    }),
    explore: b.query<any, void>({ query: () => 'public/explore/' }),
    publicUniversities: b.query<any, void>({ query: () => 'public/universities/' }),
    publicColleges: b.query<any, number | void>({
      query: (universityId) => `public/colleges/${universityId ? `?university=${universityId}` : ''}`,
    }),
    publicPickupPoints: b.query<any, string | void>({
      query: (center) => `public/pickup-points/${center ? `?center=${center}` : ''}`,
    }),
    colleges: b.query<any, Record<string, any> | void>({
      query: (p) => `config/colleges/${qs(p as any)}`, providesTags: ['College'],
    }),
    deleteCollege: b.mutation<any, number>({
      query: (id) => ({ url: `config/colleges/${id}/`, method: 'DELETE' }), invalidatesTags: ['College'],
    }),
    saveCollege: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/colleges/${id}/` : 'config/colleges/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['College'],
    }),
    availability: b.query<any, { route: number; morning_slot: number; date: string }>({
      query: (p) => `public/availability/${qs(p)}`,
    }),
    publicTourismRequest: b.mutation<any, any>({
      query: (body) => ({ url: 'public/tourism-request/', method: 'POST', body }),
    }),

    // ---- config lookups ----
    destinations: b.query<any, void>({ query: () => 'config/destinations/', providesTags: ['Destination'] }),
    saveDestination: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/destinations/${id}/` : 'config/destinations/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Destination'],
    }),
    universities: b.query<any, Record<string, any> | void>({
      query: (p) => `config/universities/${qs(p as any)}`, providesTags: ['University'],
    }),
    deleteUniversity: b.mutation<any, number>({
      query: (id) => ({ url: `config/universities/${id}/`, method: 'DELETE' }), invalidatesTags: ['University'],
    }),
    saveUniversity: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/universities/${id}/` : 'config/universities/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['University'],
    }),
    routes: b.query<any, Record<string, any> | void>({
      query: (p) => `config/routes/${qs(p as any)}`, providesTags: ['Route'],
    }),
    saveRoute: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/routes/${id}/` : 'config/routes/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Route'],
    }),
    deleteRoute: b.mutation<any, number>({
      query: (id) => ({ url: `config/routes/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Route'],
    }),
    pickupPoints: b.query<any, Record<string, any> | void>({
      query: (p) => `config/pickup-points/${qs(p as any)}`, providesTags: ['Pickup'],
    }),
    savePickup: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/pickup-points/${id}/` : 'config/pickup-points/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Pickup', 'Route'],
    }),
    deletePickup: b.mutation<any, number>({
      query: (id) => ({ url: `config/pickup-points/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Pickup', 'Route'],
    }),
    bulkSetPickups: b.mutation<any, { route: number; points: any[] }>({
      query: (body) => ({ url: 'config/pickup-points/bulk-set/', method: 'POST', body }),
      invalidatesTags: ['Pickup', 'Route'],
    }),
    pickupTimesMatrix: b.query<any, { route: number; direction: string; slot: number }>({
      query: (p) => `config/pickup-times/matrix/${qs(p as any)}`, providesTags: ['PickupTime'],
    }),
    savePickupTimes: b.mutation<any, { direction: string; slot: number; times: any[] }>({
      query: (body) => ({ url: 'config/pickup-times/bulk/', method: 'POST', body }),
      invalidatesTags: ['PickupTime'],
    }),
    morningSlots: b.query<any, void>({ query: () => 'config/morning-slots/', providesTags: ['Slot'] }),
    saveMorningSlot: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/morning-slots/${id}/` : 'config/morning-slots/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Slot'],
    }),
    returnSlots: b.query<any, void>({ query: () => 'config/return-slots/', providesTags: ['ReturnSlot'] }),
    saveReturnSlot: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/return-slots/${id}/` : 'config/return-slots/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['ReturnSlot'],
    }),
    capacities: b.query<any, void>({ query: () => 'config/seat-capacities/', providesTags: ['Capacity'] }),
    saveCapacity: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/seat-capacities/${id}/` : 'config/seat-capacities/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Capacity'],
    }),
    prices: b.query<any, Record<string, any> | void>({
      query: (p) => `config/prices/${qs(p as any)}`, providesTags: ['Price'],
    }),
    deletePrice: b.mutation<any, number>({
      query: (id) => ({ url: `config/prices/${id}/`, method: 'DELETE' }), invalidatesTags: ['Price'],
    }),
    savePrice: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/prices/${id}/` : 'config/prices/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Price'],
    }),
    paymentMethods: b.query<any, void>({ query: () => 'config/payment-methods/', providesTags: ['PayMethod'] }),
    paymentAccounts: b.query<any, void>({ query: () => 'config/payment-accounts/', providesTags: ['PayAccount'] }),
    deletePaymentAccount: b.mutation<any, number>({
      query: (id) => ({ url: `config/payment-accounts/${id}/`, method: 'DELETE' }), invalidatesTags: ['PayAccount'],
    }),
    savePaymentAccount: b.mutation<any, any>({
      query: ({ id, ...body }) => {
        const hasFile = Object.values(body).some((v: any) => v instanceof File || v instanceof Blob)
        let payload: any = body
        if (hasFile) {
          const fd = new FormData()
          Object.entries(body).forEach(([k, v]) => {
            if (v === undefined) return
            // A URL string in qr_image means "no change" — don't overwrite it.
            if (k === 'qr_image' && typeof v === 'string') return
            if (v === null) return  // null in multipart is meaningless
            if (typeof v === 'boolean') { fd.append(k, v ? 'true' : 'false'); return }
            fd.append(k, v as any)
          })
          payload = fd
        } else {
          // Strip URL strings for qr_image (unchanged); keep explicit null (removal).
          if (typeof payload.qr_image === 'string') {
            const { qr_image, ...rest } = payload
            payload = rest
          }
        }
        return { url: id ? `config/payment-accounts/${id}/` : 'config/payment-accounts/', method: id ? 'PATCH' : 'POST', body: payload }
      },
      invalidatesTags: ['PayAccount'],
    }),
    company: b.query<any, void>({ query: () => 'config/company/', providesTags: ['Company'] }),
    saveCompany: b.mutation<any, any>({
      query: (body) => ({ url: 'config/company/', method: 'PATCH', body }),
      invalidatesTags: ['Company'],
    }),

    // ---- subscriptions / bookings ----
    subscriptions: b.query<any, Record<string, any> | void>({
      query: (p) => `bookings/subscriptions/${qs(p as any)}`, providesTags: ['Subscription'],
    }),
    deleteSubscription: b.mutation<any, number>({
      query: (id) => ({ url: `bookings/subscriptions/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Subscription'],
    }),
    createSubscription: b.mutation<any, any>({
      query: (body) => ({ url: 'bookings/subscriptions/', method: 'POST', body }),
      invalidatesTags: ['Subscription'],
    }),
    submitPayment: b.mutation<any, { id: number; body: FormData }>({
      query: ({ id, body }) => ({ url: `bookings/subscriptions/${id}/submit-payment/`, method: 'POST', body }),
      invalidatesTags: ['Subscription', 'Dashboard'],
    }),
    paymentQueue: b.query<any, void>({
      query: () => 'bookings/subscriptions/payment-queue/', providesTags: ['Subscription'],
    }),
    approveSubscription: b.mutation<any, number>({
      query: (id) => ({ url: `bookings/subscriptions/${id}/approve/`, method: 'POST' }),
      invalidatesTags: ['Subscription', 'Dashboard'],
    }),
    rejectSubscription: b.mutation<any, { id: number; rejection_reason: string }>({
      query: ({ id, ...body }) => ({ url: `bookings/subscriptions/${id}/reject/`, method: 'POST', body }),
      invalidatesTags: ['Subscription', 'Dashboard'],
    }),
    markSubscriptionNotified: b.mutation<any, number>({
      query: (id) => ({ url: `bookings/subscriptions/${id}/mark-notified/`, method: 'POST' }),
      invalidatesTags: ['Subscription'],
    }),
    clearSubscriptionNotified: b.mutation<any, number>({
      query: (id) => ({ url: `bookings/subscriptions/${id}/clear-notified/`, method: 'POST' }),
      invalidatesTags: ['Subscription'],
    }),

    // ---- operations ----
    dailyTrips: b.query<any, Record<string, any> | void>({
      query: (p) => `operations/daily-trips/${qs(p as any)}`, providesTags: ['DailyTrip'],
    }),
    tripBoard: b.query<any, { date?: string } | void>({
      query: (p) => `operations/daily-trips/board/${qs(p as any)}`, providesTags: ['DailyTrip'],
    }),
    tripPassengers: b.query<any, number>({
      query: (id) => `operations/daily-trips/${id}/passengers/`, providesTags: ['SeatRequest'],
    }),
    runAllocation: b.mutation<any, { date: string }>({
      query: (body) => ({ url: 'operations/daily-trips/run-allocation/', method: 'POST', body }),
      invalidatesTags: ['DailyTrip', 'SeatRequest', 'Dashboard'],
    }),
    seatRequests: b.query<any, Record<string, any> | void>({
      query: (p) => `operations/seat-requests/${qs(p as any)}`, providesTags: ['SeatRequest'],
    }),
    bookSeat: b.mutation<any, any>({
      query: (body) => ({ url: 'operations/seat-requests/book/', method: 'POST', body }),
      invalidatesTags: ['SeatRequest', 'DailyTrip'],
    }),
    cancelSeat: b.mutation<any, number>({
      query: (id) => ({ url: `operations/seat-requests/${id}/cancel/`, method: 'POST' }),
      invalidatesTags: ['SeatRequest', 'DailyTrip'],
    }),
    // ---- interactive seat map ----
    layouts: b.query<any, void>({ query: () => 'operations/layouts/' }),
    seatmapFor: b.query<any, { date: string; route: number; direction?: string; morning_slot?: number; return_slot?: number }>({
      query: (p) => `operations/daily-trips/seatmap-for/${qs(p)}`, providesTags: ['SeatMap'],
    }),
    seatmap: b.query<any, number>({
      query: (id) => `operations/daily-trips/${id}/seatmap/`, providesTags: ['SeatMap'],
    }),
    bookSpecificSeat: b.mutation<any, any>({
      query: (body) => ({ url: 'operations/seat-requests/book-seat/', method: 'POST', body }),
      invalidatesTags: ['SeatMap', 'SeatRequest', 'DailyTrip', 'Ticket'],
    }),
    confirmSeat: b.mutation<any, number>({
      query: (id) => ({ url: `operations/seat-requests/${id}/confirm/`, method: 'POST' }),
      invalidatesTags: ['SeatMap', 'SeatRequest', 'DailyTrip'],
    }),
    releaseSeat: b.mutation<any, { id: number; seat_number: number }>({
      query: ({ id, ...body }) => ({ url: `operations/daily-trips/${id}/release-seat/`, method: 'POST', body }),
      invalidatesTags: ['SeatMap', 'SeatRequest'],
    }),
    myTickets: b.query<any, void>({
      query: () => 'operations/seat-requests/tickets/', providesTags: ['Ticket'],
    }),
    attendance: b.query<any, { date?: string } | void>({
      query: (p) => `operations/attendance/${qs(p as any)}`, providesTags: ['Attendance'],
    }),
    setAttendance: b.mutation<any, { lock_id: number; date: string; attending: boolean; slot_id?: number }>({
      query: (body) => ({ url: 'operations/attendance/set/', method: 'POST', body }),
      invalidatesTags: ['Attendance', 'SeatMap', 'Ticket'],
    }),
    returnAvailability: b.query<any, { date?: string } | void>({
      query: (p) => `operations/return-bookings/availability/${qs(p as any)}`, providesTags: ['ReturnBooking'],
    }),
    returnBookings: b.query<any, Record<string, any> | void>({
      query: (p) => `operations/return-bookings/${qs(p as any)}`, providesTags: ['ReturnBooking'],
    }),
    bookReturn: b.mutation<any, any>({
      query: (body) => ({ url: 'operations/return-bookings/book/', method: 'POST', body }),
      invalidatesTags: ['ReturnBooking'],
    }),
    changeReturn: b.mutation<any, { id: number; return_slot: number }>({
      query: ({ id, ...body }) => ({ url: `operations/return-bookings/${id}/change/`, method: 'POST', body }),
      invalidatesTags: ['ReturnBooking'],
    }),
    returnPassengers: b.query<any, Record<string, any>>({
      query: (p) => `operations/return-bookings/passengers/${qs(p)}`, providesTags: ['ReturnBooking'],
    }),

    // ---- tourism ----
    vehicleTypes: b.query<any, void>({ query: () => 'tourism/vehicle-types/', providesTags: ['Vehicle'] }),
    tourismRequests: b.query<any, Record<string, any> | void>({
      query: (p) => `tourism/requests/${qs(p as any)}`, providesTags: ['Tourism'],
    }),
    deleteTourismRequest: b.mutation<any, number>({
      query: (id) => ({ url: `tourism/requests/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Tourism', 'Dashboard'],
    }),
    createTourismRequest: b.mutation<any, any>({
      query: (body) => ({ url: 'tourism/requests/', method: 'POST', body }),
      invalidatesTags: ['Tourism', 'Dashboard'],
    }),
    acceptTourism: b.mutation<any, number>({
      query: (id) => ({ url: `tourism/requests/${id}/accept/`, method: 'POST' }),
      invalidatesTags: ['Tourism', 'Quotation'],
    }),
    rejectTourism: b.mutation<any, number>({
      query: (id) => ({ url: `tourism/requests/${id}/reject/`, method: 'POST' }),
      invalidatesTags: ['Tourism', 'Quotation'],
    }),
    createQuotation: b.mutation<any, any>({
      query: (body) => ({ url: 'tourism/quotations/', method: 'POST', body }),
      invalidatesTags: ['Quotation', 'Tourism'],
    }),
    sendQuotation: b.mutation<any, number>({
      query: (id) => ({ url: `tourism/quotations/${id}/send/`, method: 'POST' }),
      invalidatesTags: ['Quotation', 'Tourism', 'Dashboard'],
    }),

    // ---- fleet ----
    fleetDashboard: b.query<any, void>({ query: () => 'fleet/dashboard/', providesTags: ['FleetDash'] }),
    vehicles2: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/vehicles/${qs(p as any)}`, providesTags: ['FVehicle'],
    }),
    deleteVehicle: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/vehicles/${id}/`, method: 'DELETE' }), invalidatesTags: ['FVehicle'],
    }),
    saveVehicle: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `fleet/vehicles/${id}/` : 'fleet/vehicles/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['FVehicle', 'FleetDash'],
    }),
    vehicleHistory: b.query<any, number>({ query: (id) => `fleet/vehicles/${id}/history/` }),
    drivers: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/drivers/${qs(p as any)}`, providesTags: ['FDriver'],
    }),
    deleteDriver: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/drivers/${id}/`, method: 'DELETE' }), invalidatesTags: ['FDriver'],
    }),
    saveDriver: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `fleet/drivers/${id}/` : 'fleet/drivers/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['FDriver'],
    }),
    driverAlerts: b.query<any, void>({ query: () => 'fleet/drivers/license-alerts/', providesTags: ['FDriver'] }),
    driverReport: b.query<any, number>({ query: (id) => `fleet/drivers/${id}/report/` }),
    assignments: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/assignments/${qs(p as any)}`, providesTags: ['Assignment'],
    }),
    saveAssignment: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `fleet/assignments/${id}/` : 'fleet/assignments/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Assignment', 'FleetDash'],
    }),
    deleteAssignment: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/assignments/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Assignment', 'FleetDash'],
    }),
    myToday: b.query<any, void>({ query: () => 'fleet/assignments/my-today/', providesTags: ['Assignment'] }),
    driverManifest: b.query<any, number>({ query: (id) => `fleet/assignments/${id}/manifest/` }),
    startTrip: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/assignments/${id}/start/`, method: 'POST' }), invalidatesTags: ['Assignment', 'FVehicle'],
    }),
    completeTrip: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/assignments/${id}/complete/`, method: 'POST' }), invalidatesTags: ['Assignment', 'FVehicle'],
    }),
    expenses: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/expenses/${qs(p as any)}`, providesTags: ['Expense'],
    }),
    createExpense: b.mutation<any, FormData>({
      query: (body) => ({ url: 'fleet/expenses/', method: 'POST', body }), invalidatesTags: ['Expense', 'FleetDash'],
    }),
    deleteExpense: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/expenses/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Expense', 'FleetDash'],
    }),
    approveExpense: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/expenses/${id}/approve/`, method: 'POST' }), invalidatesTags: ['Expense', 'FleetDash'],
    }),
    rejectExpense: b.mutation<any, { id: number; rejection_reason: string }>({
      query: ({ id, ...body }) => ({ url: `fleet/expenses/${id}/reject/`, method: 'POST', body }), invalidatesTags: ['Expense', 'FleetDash'],
    }),
    maintenance: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/maintenance/${qs(p as any)}`, providesTags: ['Maintenance'],
    }),
    saveMaintenance: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `fleet/maintenance/${id}/` : 'fleet/maintenance/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Maintenance'],
    }),
    deleteMaintenance: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/maintenance/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Maintenance'],
    }),
    fines: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/fines/${qs(p as any)}`, providesTags: ['Fine'],
    }),
    saveFine: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `fleet/fines/${id}/` : 'fleet/fines/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Fine'],
    }),
    deleteFine: b.mutation<any, number>({
      query: (id) => ({ url: `fleet/fines/${id}/`, method: 'DELETE' }),
      invalidatesTags: ['Fine'],
    }),
    auditLogs: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/audit-logs/${qs(p as any)}`, providesTags: ['Audit'],
    }),
    vehicleExpenseReport: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/reports/vehicle-expenses/${qs(p as any)}`,
    }),
    tripCostReport: b.query<any, Record<string, any> | void>({
      query: (p) => `fleet/reports/trip-cost/${qs(p as any)}`,
    }),
    operationsDashboard: b.query<any, { date?: string } | void>({
      query: (p) => `fleet/operations-dashboard/${qs(p as any)}`, providesTags: ['Assignment', 'FleetDash'],
    }),

    // ---- notifications ----
    unreadNotifications: b.query<any, void>({
      query: () => 'notifications/unread/', providesTags: ['Notification'],
    }),
    markAllRead: b.mutation<any, void>({
      query: () => ({ url: 'notifications/mark-all-read/', method: 'POST' }),
      invalidatesTags: ['Notification'],
    }),
  }),
})

export const {
  useLoginMutation, useRegisterMutation, usePasswordResetLookupMutation, useResetStudentPasswordMutation, useAdminResetUserPasswordMutation, useMeQuery, useUpdateProfileMutation,
  useUsersQuery, useSaveUserMutation, useDeleteUserMutation, usePermissionsMatrixQuery, useSavePermissionsMutation, useDashboardQuery, useDashboardChartsQuery, useFinanceReportQuery, useExploreQuery, usePublicUniversitiesQuery,
  useLazyAvailabilityQuery, usePublicTourismRequestMutation,
  usePublicCollegesQuery, useCollegesQuery, useSaveCollegeMutation, useDeleteCollegeMutation,
  useDestinationsQuery, useSaveDestinationMutation,
  useUniversitiesQuery, useSaveUniversityMutation, useDeleteUniversityMutation,
  useRoutesQuery, useSaveRouteMutation, useDeleteRouteMutation, usePublicPickupPointsQuery,
  usePickupPointsQuery, useSavePickupMutation, useDeletePickupMutation, useBulkSetPickupsMutation,
  usePickupTimesMatrixQuery, useSavePickupTimesMutation,
  useMorningSlotsQuery, useSaveMorningSlotMutation,
  useReturnSlotsQuery, useSaveReturnSlotMutation,
  useCapacitiesQuery, useSaveCapacityMutation,
  usePricesQuery, useSavePriceMutation, useDeletePriceMutation,
  usePaymentMethodsQuery, usePaymentAccountsQuery, useSavePaymentAccountMutation, useDeletePaymentAccountMutation,
  useCompanyQuery, useSaveCompanyMutation,
  useSubscriptionsQuery, useCreateSubscriptionMutation, useDeleteSubscriptionMutation, useSubmitPaymentMutation,
  usePaymentQueueQuery, useApproveSubscriptionMutation, useRejectSubscriptionMutation,
  useMarkSubscriptionNotifiedMutation, useClearSubscriptionNotifiedMutation,
  useDailyTripsQuery, useTripBoardQuery, useTripPassengersQuery, useRunAllocationMutation,
  useSeatRequestsQuery, useBookSeatMutation, useCancelSeatMutation,
  useLayoutsQuery, useSeatmapForQuery, useSeatmapQuery, useBookSpecificSeatMutation,
  useConfirmSeatMutation, useReleaseSeatMutation, useMyTicketsQuery,
  useAttendanceQuery, useSetAttendanceMutation,
  useReturnAvailabilityQuery, useReturnBookingsQuery, useBookReturnMutation,
  useChangeReturnMutation, useReturnPassengersQuery,
  useVehicleTypesQuery, useTourismRequestsQuery, useCreateTourismRequestMutation, useDeleteTourismRequestMutation,
  useAcceptTourismMutation, useRejectTourismMutation,
  useCreateQuotationMutation, useSendQuotationMutation,
  useUnreadNotificationsQuery, useMarkAllReadMutation,
  // fleet
  useFleetDashboardQuery, useVehicles2Query, useSaveVehicleMutation, useDeleteVehicleMutation, useVehicleHistoryQuery,
  useDriversQuery, useSaveDriverMutation, useDeleteDriverMutation, useDriverAlertsQuery, useDriverReportQuery,
  useAssignmentsQuery, useSaveAssignmentMutation, useDeleteAssignmentMutation, useMyTodayQuery, useLazyDriverManifestQuery, useStartTripMutation, useCompleteTripMutation,
  useExpensesQuery, useCreateExpenseMutation, useDeleteExpenseMutation, useApproveExpenseMutation, useRejectExpenseMutation,
  useMaintenanceQuery, useSaveMaintenanceMutation, useDeleteMaintenanceMutation, useFinesQuery, useSaveFineMutation, useDeleteFineMutation,
  useAuditLogsQuery, useVehicleExpenseReportQuery,
  useTripCostReportQuery, useOperationsDashboardQuery,
} = api

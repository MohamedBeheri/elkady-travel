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
    'User', 'Route', 'University', 'Destination', 'Pickup', 'Slot', 'ReturnSlot',
    'Capacity', 'Price', 'PayMethod', 'PayAccount', 'Company',
    'Subscription', 'DailyTrip', 'SeatRequest', 'ReturnBooking', 'SeatMap', 'Ticket',
    'Tourism', 'Quotation', 'Vehicle', 'Notification', 'Dashboard',
  ],
  endpoints: (b) => ({
    // ---- auth ----
    login: b.mutation<any, { username: string; password: string }>({
      query: (body) => ({ url: 'auth/login/', method: 'POST', body }),
    }),
    register: b.mutation<any, any>({
      query: (body) => ({ url: 'auth/register/', method: 'POST', body }),
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

    // ---- dashboard ----
    dashboard: b.query<any, void>({ query: () => 'dashboard/stats/', providesTags: ['Dashboard'] }),
    dashboardCharts: b.query<any, void>({ query: () => 'dashboard/charts/', providesTags: ['Dashboard'] }),
    explore: b.query<any, void>({ query: () => 'public/explore/' }),
    publicUniversities: b.query<any, void>({ query: () => 'public/universities/' }),
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
    savePrice: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/prices/${id}/` : 'config/prices/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Price'],
    }),
    paymentMethods: b.query<any, void>({ query: () => 'config/payment-methods/', providesTags: ['PayMethod'] }),
    paymentAccounts: b.query<any, void>({ query: () => 'config/payment-accounts/', providesTags: ['PayAccount'] }),
    savePaymentAccount: b.mutation<any, any>({
      query: ({ id, ...body }) => ({ url: id ? `config/payment-accounts/${id}/` : 'config/payment-accounts/', method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['PayAccount'],
    }),
    company: b.query<any, void>({ query: () => 'config/company/', providesTags: ['Company'] }),

    // ---- subscriptions / bookings ----
    subscriptions: b.query<any, Record<string, any> | void>({
      query: (p) => `bookings/subscriptions/${qs(p as any)}`, providesTags: ['Subscription'],
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
    seatmapFor: b.query<any, { date: string; route: number; morning_slot: number }>({
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
  useLoginMutation, useRegisterMutation, useMeQuery, useUpdateProfileMutation,
  useUsersQuery, useSaveUserMutation, useDashboardQuery, useDashboardChartsQuery, useExploreQuery, usePublicUniversitiesQuery,
  useLazyAvailabilityQuery, usePublicTourismRequestMutation,
  useDestinationsQuery, useSaveDestinationMutation,
  useUniversitiesQuery, useSaveUniversityMutation,
  useRoutesQuery, useSaveRouteMutation,
  usePickupPointsQuery, useSavePickupMutation, useDeletePickupMutation,
  useMorningSlotsQuery, useSaveMorningSlotMutation,
  useReturnSlotsQuery, useSaveReturnSlotMutation,
  useCapacitiesQuery, useSaveCapacityMutation,
  usePricesQuery, useSavePriceMutation,
  usePaymentMethodsQuery, usePaymentAccountsQuery, useSavePaymentAccountMutation,
  useCompanyQuery,
  useSubscriptionsQuery, useCreateSubscriptionMutation, useSubmitPaymentMutation,
  usePaymentQueueQuery, useApproveSubscriptionMutation, useRejectSubscriptionMutation,
  useDailyTripsQuery, useTripBoardQuery, useTripPassengersQuery, useRunAllocationMutation,
  useSeatRequestsQuery, useBookSeatMutation, useCancelSeatMutation,
  useLayoutsQuery, useSeatmapForQuery, useSeatmapQuery, useBookSpecificSeatMutation,
  useConfirmSeatMutation, useReleaseSeatMutation, useMyTicketsQuery,
  useReturnAvailabilityQuery, useReturnBookingsQuery, useBookReturnMutation,
  useChangeReturnMutation, useReturnPassengersQuery,
  useVehicleTypesQuery, useTourismRequestsQuery, useCreateTourismRequestMutation,
  useAcceptTourismMutation, useRejectTourismMutation,
  useCreateQuotationMutation, useSendQuotationMutation,
  useUnreadNotificationsQuery, useMarkAllReadMutation,
} = api

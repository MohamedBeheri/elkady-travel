import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface User {
  id: number
  username: string
  full_name: string
  email?: string
  role: string
  role_display: string
  national_id?: string
  phone?: string
  center?: string
  center_display?: string
  pickup_point?: number
  pickup_name?: string
  address?: string
  date_of_birth?: string
  gender?: string
  gender_display?: string
  university?: number | null
  university_name?: string
  college?: number | null
  college_name?: string
  academic_year?: string
  year_display?: string
  permissions?: Record<string, { view: boolean; add: boolean; edit: boolean; delete: boolean }>
}

interface AuthState {
  access: string | null
  refresh: string | null
  user: User | null
}

const initialState: AuthState = {
  access: localStorage.getItem('access'),
  refresh: localStorage.getItem('refresh'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ access: string; refresh: string; user: User }>) {
      state.access = action.payload.access
      state.refresh = action.payload.refresh
      state.user = action.payload.user
      localStorage.setItem('access', action.payload.access)
      localStorage.setItem('refresh', action.payload.refresh)
      localStorage.setItem('user', JSON.stringify(action.payload.user))
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload
      localStorage.setItem('user', JSON.stringify(action.payload))
    },
    logout(state) {
      state.access = null
      state.refresh = null
      state.user = null
      localStorage.clear()
    },
  },
})

export const { setCredentials, setUser, logout } = authSlice.actions
export default authSlice.reducer

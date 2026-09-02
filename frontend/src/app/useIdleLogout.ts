import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import { useAppDispatch, useAppSelector } from './store'
import { logout } from './authSlice'
import { api } from './api'

/** Minutes of inactivity before the session is force-logged-out. */
const IDLE_MINUTES = 45
const IDLE_MS = IDLE_MINUTES * 60 * 1000
/** How often we persist the "last activity" timestamp (throttle writes). */
const SAVE_EVERY_MS = 15 * 1000
const STORAGE_KEY = 'lastActivityAt'

/**
 * Auto-logout after IDLE_MINUTES of no user interaction.
 *
 * Uses a wall-clock timestamp in localStorage so the timeout survives tab
 * reloads and stays consistent across tabs — this also clears the stale RTK
 * Query cache that was causing issues after long idle periods.
 */
export function useIdleLogout() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const access = useAppSelector((s) => s.auth.access)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSave = useRef(0)

  useEffect(() => {
    if (!access) return

    const doLogout = () => {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      dispatch(logout())
      dispatch(api.util.resetApiState())
      message.warning('تم تسجيل خروجك تلقائياً بعد ٤٥ دقيقة بدون نشاط.')
      navigate('/login', { replace: true })
    }

    const arm = () => {
      if (timer.current) clearTimeout(timer.current)
      const last = Number(localStorage.getItem(STORAGE_KEY) || Date.now())
      const remaining = IDLE_MS - (Date.now() - last)
      if (remaining <= 0) { doLogout(); return }
      timer.current = setTimeout(doLogout, remaining)
    }

    const markActivity = () => {
      const now = Date.now()
      if (now - lastSave.current > SAVE_EVERY_MS) {
        lastSave.current = now
        try { localStorage.setItem(STORAGE_KEY, String(now)) } catch { /* ignore */ }
        arm()
      }
    }

    // Seed the timestamp on mount so a fresh login starts the clock.
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
    lastSave.current = Date.now()
    arm()

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }))

    // Re-check when the tab regains focus (covers sleep/long background).
    const onVisible = () => { if (document.visibilityState === 'visible') arm() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      events.forEach((e) => window.removeEventListener(e, markActivity))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [access, dispatch, navigate, message])
}

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import { useAppDispatch, useAppSelector } from './store'
import { logout } from './authSlice'
import { api } from './api'

/** Minutes of inactivity before the session is force-logged-out. */
const IDLE_MINUTES = 60
const IDLE_MS = IDLE_MINUTES * 60 * 1000
/** How often we persist the "last activity" timestamp (throttle writes). */
const SAVE_EVERY_MS = 15 * 1000
/** How often we check whether the idle limit has passed (wall-clock based). */
const CHECK_EVERY_MS = 30 * 1000
const STORAGE_KEY = 'lastActivityAt'

function readTS(): number {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || 0 } catch { return 0 }
}
function writeTS(v: number) {
  try { localStorage.setItem(STORAGE_KEY, String(v)) } catch { /* ignore */ }
}

/**
 * Auto-logout after IDLE_MINUTES of no user interaction.
 *
 * Reliability notes (this is why it's a wall-clock interval, not one long timer):
 *   • A single 60-min setTimeout is throttled/dropped by mobile browsers when the
 *     screen locks, so it often never fired — we poll every 30s instead.
 *   • We DON'T reset the timestamp on mount; otherwise reopening the app (as
 *     students do constantly on phones) restarted the idle clock forever.
 *   • The timestamp lives in localStorage so it survives reloads and is shared
 *     across tabs. On logout we also clear the RTK Query cache (fixes the stale
 *     data after long idle periods).
 */
export function useIdleLogout() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { message } = AntdApp.useApp()
  const access = useAppSelector((s) => s.auth.access)
  const lastSave = useRef(0)

  useEffect(() => {
    if (!access) return

    const doLogout = () => {
      writeTS(0)
      dispatch(logout())
      dispatch(api.util.resetApiState())
      message.warning('تم تسجيل خروجك تلقائياً بعد ٦٠ دقيقة بدون نشاط.')
      navigate('/login', { replace: true })
    }

    const expired = () => {
      const last = readTS()
      return last > 0 && Date.now() - last >= IDLE_MS
    }

    // On mount: keep the existing clock. If already past the limit, log out now;
    // if there's no timestamp yet (fresh login), start it.
    const existing = readTS()
    if (existing > 0) {
      if (Date.now() - existing >= IDLE_MS) { doLogout(); return }
    } else {
      writeTS(Date.now())
    }
    lastSave.current = Date.now()

    const markActivity = () => {
      const now = Date.now()
      if (now - lastSave.current > SAVE_EVERY_MS) {
        lastSave.current = now
        writeTS(now)
      }
    }

    const check = () => { if (expired()) doLogout() }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }))
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const iv = setInterval(check, CHECK_EVERY_MS)

    return () => {
      clearInterval(iv)
      events.forEach((e) => window.removeEventListener(e, markActivity))
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [access, dispatch, navigate, message])
}

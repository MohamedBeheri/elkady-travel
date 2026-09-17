import { useAppSelector } from './store'

export type ScreenPerm = { view: boolean; add: boolean; edit: boolean; delete: boolean }
const FULL: ScreenPerm = { view: true, add: true, edit: true, delete: true }
const NONE: ScreenPerm = { view: false, add: false, edit: false, delete: false }

/** Effective permissions for a screen key (route path). Admin → full access. */
export function usePerm(screen: string): ScreenPerm {
  const user = useAppSelector((s) => s.auth.user)
  if (!user) return NONE
  if (user.role === 'admin') return FULL
  const p = user.permissions?.[screen]
  return p ? p : NONE
}

/** Can the current user view a given screen? Admin always true. */
export function useCanView(screen: string): boolean {
  return usePerm(screen).view
}

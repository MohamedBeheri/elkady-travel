/** AntD form rule: phone must be exactly 11 digits (passes when empty, for optional fields). */
export const phoneRule = {
  validator: (_: any, value: any) =>
    !value || /^\d{11}$/.test(String(value))
      ? Promise.resolve()
      : Promise.reject(new Error('رقم الهاتف يجب أن يكون ١١ رقماً')),
}

/** Collapse pickup points to one row per physical location (same name + same center).
 *
 * The API returns each point once per route it belongs to (a physical stop can
 * appear on several routes to different destinations), which shows the student
 * a duplicated list. Dedupe keeps the first occurrence — sufficient for profile
 * & booking, since the surviving `route_id`/`destination_name` still resolves.
 */
export function dedupePickups<T extends { name: string; center?: string }>(items: T[] = []): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const p of items) {
    const key = `${(p.center || '').trim()}::${p.name.trim()}`
    if (seen.has(key)) continue
    seen.add(key); out.push(p)
  }
  return out
}

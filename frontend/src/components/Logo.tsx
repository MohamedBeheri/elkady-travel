import { useState } from 'react'

/** ELKADY TRAVEL logo. Renders /logo.png; falls back to a branded emoji mark
 *  until the image file is placed in frontend/public/logo.png. */
export default function Logo({ size = 92, className = 'brand-logo' }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className={`${className} brand-logo--fallback`} style={{ width: size, height: size, fontSize: size * 0.45 }}>
        🚌
      </div>
    )
  }
  return (
    <img
      src="/logo.png"
      alt="ELKADY TRAVEL"
      className={className}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}

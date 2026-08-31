/** Design & development credit for شركة كفو لتطوير البرمجيات. */
export default function KaffoCredit({ dark = false, style }: { dark?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ textAlign: 'center', fontSize: 12, color: dark ? '#cdd8ea' : '#94a3b8', ...style }}>
      تصميم وبرمجة{' '}
      <a href="https://www.kaffo.co" target="_blank" rel="noopener noreferrer"
        style={{ color: dark ? '#F5A44E' : '#EC6A16', fontWeight: 700 }}>
        شركة كفو لتطوير البرمجيات
      </a>{' '}
      · www.kaffo.co
    </div>
  )
}

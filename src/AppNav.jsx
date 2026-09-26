const LINKS = [
  { href: '/test/apps/', label: '🏠' },
  { href: '/test/', label: '✨' },
  { href: '/test/vicinitygo/', label: '🧭' },
  { href: 'https://jonnymexican.github.io/brocredit/', label: '🎖️' },
  { href: 'https://jonnymexican.github.io/adhdTracker/', label: '✅' },
];

/** Tiny cross-app nav. `current` is the href of the app you're in. */
export default function AppNav({ current }) {
  return (
    <nav className="app-nav" aria-label="All apps">
      {LINKS.map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={`app-nav-link ${l.href === current ? 'current' : ''}`}
          aria-current={l.href === current ? 'page' : undefined}
          title={
            l.href === '/test/apps/'
              ? 'All apps'
              : l.href === '/test/'
                ? 'Get Inspired'
                : l.href.includes('vicinitygo')
                  ? 'vicinityGo'
                  : l.href.includes('brocredit')
                    ? 'FriendCredit'
                    : 'adhdTracker'
          }
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}

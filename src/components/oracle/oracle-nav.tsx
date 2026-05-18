'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/oracle', label: 'Overview', exact: true },
  { href: '/oracle/agents', label: 'Agents', exact: false },
  { href: '/oracle/network', label: 'Network', exact: false },
  { href: '/oracle/feeds', label: 'Feeds', exact: false },
]

export function OracleNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-0 border-b border-zinc-800 px-6 h-10">
      <Link
        href="/oracle"
        className="mr-5 text-sm font-bold text-zinc-100 tracking-tight font-mono"
      >
        ORACLE
      </Link>
      <div className="flex items-center gap-0 h-full">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-3 h-full flex items-center text-xs font-medium transition-colors ${
                isActive
                  ? 'text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-3 right-3 h-px bg-emerald-400" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

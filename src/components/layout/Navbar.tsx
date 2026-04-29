import { Link, NavLink } from 'react-router-dom'
import { Map } from 'lucide-react'

export function Navbar() {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          className="flex items-center gap-2 text-sm font-bold text-ink"
          to="/"
        >
          <span className="grid size-8 place-items-center rounded-md bg-forest text-white">
            <Map className="size-4" aria-hidden="true" />
          </span>
          Maps
        </Link>
        <nav className="flex items-center gap-1">
          <NavLink
            className={({ isActive }) =>
              [
                'rounded-md px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-field text-ink'
                  : 'text-slate-600 hover:bg-field hover:text-ink',
              ].join(' ')
            }
            to="/explorer"
          >
            Explorer
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

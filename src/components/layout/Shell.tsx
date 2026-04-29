import type { ReactNode } from 'react'
import { Navbar } from './Navbar'

type ShellProps = {
  children: ReactNode
}

export function Shell({ children }: ShellProps) {
  return (
    <div className="min-h-screen bg-field text-ink">
      <Navbar />
      <main>{children}</main>
    </div>
  )
}

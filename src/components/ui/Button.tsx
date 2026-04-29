import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: 'primary' | 'secondary'
}

export function Button({
  children,
  className,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-water focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' &&
          'bg-forest text-white hover:bg-forest/90 active:bg-forest/80',
        variant === 'secondary' &&
          'border border-line bg-white text-ink hover:bg-slate-50 active:bg-slate-100',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

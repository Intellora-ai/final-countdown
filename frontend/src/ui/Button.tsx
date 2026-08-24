import React from 'react'

/* Visual contract of the Agabi Button the mockup used (variant/size/state).
 * At integration, replace with the real Agabi component library — the props
 * are aligned so it is a rename, not a rewrite. */
export function Button(props: {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const { variant = 'primary', size = 'lg', disabled, onClick, children, style } = props
  return (
    <button className={'btn ' + variant + ' ' + size} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  )
}

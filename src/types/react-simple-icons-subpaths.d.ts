declare module '@icons-pack/react-simple-icons/icons/*.mjs' {
  import type { ComponentType } from 'react'

  export const defaultColor: string

  const Icon: ComponentType<{
    size?: number | string
    color?: string
    className?: string
    title?: string
  }>

  export default Icon
}

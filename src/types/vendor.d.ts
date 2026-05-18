declare module 'react-force-graph-3d' {
  import type { ForwardRefExoticComponent, RefAttributes } from 'react'
  import type { Scene, WebGLRenderer } from 'three'
  export interface ForceGraphMethods {
    d3Force(name: string, force?: unknown): unknown
    d3ReheatSimulation(): void
    cameraPosition(position: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, transitionMs?: number): void
    renderer(): WebGLRenderer
    scene(): Scene
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    postProcessingComposer(): any
    refresh(): void
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ForceGraph3D: ForwardRefExoticComponent<any & RefAttributes<ForceGraphMethods>>
  export default ForceGraph3D
}

declare module 'three-spritetext' {
  import { Mesh, SpriteMaterial } from 'three'
  export default class SpriteText extends Mesh {
    constructor(text?: string, textHeight?: number, color?: string)
    material: SpriteMaterial
    text: string
    textHeight: number
    color: string
    backgroundColor: string | false
    padding: number
    borderWidth: number
    borderColor: string
    borderRadius: number
    fontFace: string
    fontSize: number
    fontWeight: string
    strokeWidth: number
    strokeColor: string
  }
}

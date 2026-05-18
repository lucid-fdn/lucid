declare module 'bn.js' {
  class BN {
    constructor(value: number | string | BN, base?: number)
    toString(base?: number): string
    toNumber(): number
    mul(b: BN): BN
    div(b: BN): BN
    add(b: BN): BN
    sub(b: BN): BN
  }
  export default BN
}

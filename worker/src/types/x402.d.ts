declare module '@x402/fetch' {
  export function wrapFetchWithPayment(
    fetch: typeof globalThis.fetch,
    client: unknown
  ): typeof globalThis.fetch

  export class x402Client {
    constructor()
    register(pattern: string, scheme: unknown): void
  }
}

declare module '@x402/evm/exact/client' {
  export class ExactEvmScheme {
    constructor(options: unknown)
  }
}

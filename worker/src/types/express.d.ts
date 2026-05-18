declare module 'express' {
  import type { Server } from 'http'

  export interface Request {
    body: Record<string, unknown>
    params: Record<string, string>
    query: Record<string, string | string[] | undefined>
    headers: Record<string, string | string[] | undefined>
    method: string
    url: string
    path: string
    ip?: string
  }

  export interface Response {
    status(code: number): Response
    json(body: unknown): Response
    send(body?: unknown): Response
    end(): Response
    set(field: string, value: string): Response
    header(field: string, value: string): Response
    write(chunk: unknown): boolean
    writableFinished: boolean
    on(event: string, listener: (...args: unknown[]) => void): Response
    setHeader(name: string, value: string | number | readonly string[]): Response
    headersSent: boolean
    statusCode: number
  }

  export interface NextFunction {
    (err?: unknown): void
  }

  export type RequestHandler = (req: Request, res: Response, next: NextFunction) => unknown

  export interface Application {
    use(...handlers: Array<RequestHandler | string>): Application
    get(path: string, ...handlers: RequestHandler[]): Application
    post(path: string, ...handlers: Array<RequestHandler | ((req: Request, res: Response) => unknown)>): Application
    put(path: string, ...handlers: RequestHandler[]): Application
    delete(path: string, ...handlers: RequestHandler[]): Application
    listen(port: number, callback?: () => void): Server
  }

  interface Express {
    (): Application
    json(options?: { limit?: string }): RequestHandler
  }

  const express: Express
  export default express
}

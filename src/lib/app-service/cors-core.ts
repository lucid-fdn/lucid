export function withGeneratedAppCorsHeaders(response: Response, origin: string | null): Response {
  if (!origin) return response
  response.headers.set('access-control-allow-origin', origin)
  response.headers.set('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.headers.set('access-control-allow-headers', 'authorization,content-type,x-request-id')
  response.headers.set('vary', 'Origin')
  return response
}

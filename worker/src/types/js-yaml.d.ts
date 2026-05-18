declare module 'js-yaml' {
  function load(input: string, options?: Record<string, unknown>): unknown
  function dump(input: unknown, options?: Record<string, unknown>): string
  export default { load, dump }
  export { load, dump }
}

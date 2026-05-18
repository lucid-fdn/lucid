import 'server-only'

import type * as OpenClawRuntime from '@lucid/openclaw-runtime'

/**
 * Lazy loader for `@lucid/openclaw-runtime`.
 *
 * Why dynamic import?
 * - The runtime package has a very heavy transitive dep graph
 *   (`@buape/carbon`, `discord-api-types`, `grammy`, `@slack/bolt`, etc.) and
 *   is listed in `serverExternalPackages` in `next.config.mjs`. Dynamically
 *   importing it means the code path only pays the load cost the first time
 *   a shim actually fires — call sites that stay on the legacy sender (the
 *   default while Phase 3 cutover is pending) never touch it.
 *
 * Why a single module-level promise?
 * - `import()` itself caches, but wrapping it in one shared promise lets us
 *   guarantee `setRuntimeConfigSnapshot({})` is called exactly once across
 *   every shim, not once per shim file.
 *
 * Why `setRuntimeConfigSnapshot({})`?
 * - OpenClaw's internal `loadConfig()` walks the filesystem for YAML. We
 *   don't want that on Vercel. Priming an empty snapshot short-circuits
 *   the walk; the shims thread credentials through `opts.token` on every
 *   call so no config lookup is needed.
 */

type RuntimeModule = typeof OpenClawRuntime

let runtimePromise: Promise<RuntimeModule> | null = null

/**
 * Webpack-opaque dynamic import.
 *
 * `@lucid/openclaw-runtime` is a workspace package (`packages/openclaw-runtime`),
 * not an npm package. `serverExternalPackages` in next.config.mjs does not
 * externalize workspace packages — Next resolves them to a file path before
 * externals are consulted and then statically traces the entire transitive
 * dep graph (`@discordjs/voice`, `node-llama-cpp`, `ffmpeg-static`, etc.) into
 * the Next build. That breaks any machine that doesn't have the native binaries.
 *
 * Wrapping `import()` inside `new Function()` makes the specifier opaque to
 * webpack's static analyzer — webpack can't know what string will be passed,
 * so it doesn't trace anything. At runtime, Node.js resolves the module
 * normally. This is the standard workaround for server-only native deps
 * imported from workspace packages in Next.js.
 */
const nodeImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>

// Under vitest, `new Function('return import(...)')` runs in a vm context that
// has no dynamic-import callback configured, so the webpack-opaque trick above
// throws `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Vitest sets `process.env.VITEST`
// at runtime, which lets us fall back to a plain static import() — vitest's
// module registry will still honour any `vi.mock('@lucid/openclaw-runtime')`
// declared in the test file.
const isVitest =
  typeof process !== 'undefined' && process.env != null && process.env.VITEST != null

export async function loadOpenClawRuntime(): Promise<RuntimeModule> {
  if (!runtimePromise) {
    const importRuntime: () => Promise<RuntimeModule> = isVitest
      ? () =>
          import(
            /* webpackIgnore: true */
            /* turbopackIgnore: true */
            '@lucid/openclaw-runtime'
          ) as Promise<RuntimeModule>
      : () => nodeImport<RuntimeModule>('@lucid/openclaw-runtime')
    runtimePromise = importRuntime().then((mod) => {
      try {
        mod.setRuntimeConfigSnapshot({})
      } catch {
        // Config may already be primed by another shim or by the worker.
        // setRuntimeConfigSnapshot is idempotent — safe to ignore.
      }
      return mod
    })
  }
  return runtimePromise
}

/**
 * Test-only: clear the cached promise so each test starts with a fresh
 * dynamic import. Exported under a `__` prefix to flag it as non-public.
 */
export function __resetOpenClawRuntimeForTests() {
  runtimePromise = null
}

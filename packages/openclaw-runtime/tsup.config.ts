import { defineConfig } from 'tsup'
import path from 'path'
import fs from 'fs'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: false,
  // ALL bare-specifier imports are external.
  // No need to install openclaw-core's node_modules at build time.
  // External deps are resolved at runtime from the worker's node_modules.
  esbuildOptions(options) {
    options.packages = 'external'
  },
  // OpenClaw source uses .js extensions in imports but actual files are .ts
  // (TypeScript NodeNext convention: write .js, file is .ts)
  // esbuild doesn't resolve .js → .ts by default, so we add a plugin
  esbuildPlugins: [{
    name: 'resolve-js-to-ts',
    setup(build) {
      build.onResolve({ filter: /\.js$/ }, (args) => {
        if (!args.path.startsWith('.')) return undefined
        const jsPath = path.resolve(args.resolveDir, args.path)
        const tsPath = jsPath.replace(/\.js$/, '.ts')
        if (fs.existsSync(tsPath)) {
          return { path: tsPath }
        }
        return undefined
      })
    }
  }],
  // CJS require() shim for bundled ESM (same as lucid-plugins-embedded)
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
})

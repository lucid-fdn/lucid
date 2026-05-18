import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: [
      'node_modules',
      '.next',
      'packages/**',
      'worker/**',
      'tests/integration/agent-provider-trace-propagation.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'src/sanity/**',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@contracts': path.resolve(__dirname, './contracts'),
      '@lucid/app-client': path.resolve(__dirname, './packages/app-client/src/index.ts'),
      '@lucid/app-client/schemas': path.resolve(__dirname, './packages/app-client/src/schemas.ts'),
      '@lucid/app-core': path.resolve(__dirname, './packages/app-core/src/index.ts'),
      '@lucid/browser-checkout-adapter': path.resolve(__dirname, './packages/browser-checkout-adapter/src/index.ts'),
    },
  },
})

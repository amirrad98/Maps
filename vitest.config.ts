import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Only co-located unit tests; tests/e2e/ holds the Playwright specs.
    include: ['src/**/*.test.ts'],
  },
})

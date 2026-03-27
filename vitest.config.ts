import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        branches: 80,
        functions: 40,
        lines: 35,
        statements: 35,
        // TODO: raise back to 80% once all issues (#2-#6) are implemented
      },
    },
  },
});

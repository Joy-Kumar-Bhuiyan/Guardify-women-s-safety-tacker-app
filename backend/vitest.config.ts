import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/store/firestore.ts'],
      thresholds: { lines: 80, functions: 80, branches: 65, statements: 80 }
    }
  }
});

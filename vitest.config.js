import { defineConfig } from 'vitest/config';

// Pure unit tests (no emulator). Rules tests use vitest.rules.config.js.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});

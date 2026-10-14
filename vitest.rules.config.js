import { defineConfig } from 'vitest/config';

// Firestore rules tests. Run only through `npm run test:rules`
// (wrapped in `firebase emulators:exec`), never directly.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

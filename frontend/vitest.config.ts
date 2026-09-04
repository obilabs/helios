import { defineConfig } from 'vitest/config';

// Standalone Vitest config (kept separate from vite.config.ts so unit tests do
// not pull in the React plugin or dev-server proxy). The Google API request
// builders are pure TS, so the default Node environment is sufficient.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 10000,
  // Don't transform node_modules
  transformIgnorePatterns: ['/node_modules/'],
  // Setup files - only for tests that need them (knowledge tests mock their own logger)
  // setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  // Clear mocks between tests
  clearMocks: true,
  // ESM-compatible ts-jest configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'Node'
      }
    }],
  },
  // Limit workers to reduce memory usage
  maxWorkers: 1,
  // ts-jest's ESM transform (useESM) leaks memory across suites, so a single
  // long-lived worker OOMs partway through the full suite ("Reached heap limit
  // … Aborted"). Recycle the worker once it exceeds this, freeing the leak
  // between test files so the whole suite can complete. See the test script's
  // --max-old-space-size bump for additional headroom.
  workerIdleMemoryLimit: '512MB',
};

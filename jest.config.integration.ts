import type { Config } from 'jest';
const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/tests/integration/**/*.test.ts'],
  collectCoverage: false,
  coverageDirectory: 'test-results/coverage',
  coverageReporters: ['html', 'text', 'lcov', 'text-summary'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/tests/**',
  ],
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Integration tests hit real DB/SQS — allow more time
  testTimeout: 30000,
};

export default config;
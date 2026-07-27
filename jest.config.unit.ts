import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.ts'],
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
  testTimeout: 10000,
};

export default config;

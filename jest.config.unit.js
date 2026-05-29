/**
 * Jest Configuration for Unit Tests Only
 *
 * This config skips database setup since unit tests mock all dependencies.
 * Use this for fast unit testing without database overhead.
 *
 * Usage:
 *   npm test -- --config=jest.config.unit.js
 *   npm test -- tests/unit/controllers/ --config=jest.config.unit.js
 */

module.exports = {
  testEnvironment: 'node',
  // NO globalSetup for unit tests - no database needed!
  setupFilesAfterEnv: ['./tests/setup/jest.setupAfterEnv.js'],
  testMatch: ['**/tests/unit/**/*.test.js', '**/tests/unit/**/*.test.ts'],
  collectCoverage: false, // Disable by default for speed
  coverageDirectory: 'test-results/coverage',
  coverageReporters: ['html', 'text', 'lcov', 'text-summary'],
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.ts',
    '!src/**/*.test.js',
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
    '^.+\\.jsx?$': 'babel-jest',
  },
  transformIgnorePatterns: ['node_modules/(?!(openid-client|oauth4webapi)/)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  moduleNameMapper: {
    '^openid-client$': '<rootDir>/tests/__mocks__/openid-client.js',
    '^@aws-sdk/client-s3$': '<rootDir>/tests/__mocks__/@aws-sdk/client-s3.js',
    '^@aws-sdk/s3-request-presigner$': '<rootDir>/tests/__mocks__/@aws-sdk/s3-request-presigner.js',
  },
  setupFiles: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 10000, // 10 seconds for unit tests

  // HTML Report (opens in browser) - GOV.UK Style
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle: 'Unit Test Results - DESNZ SYEIA',
        outputPath: 'test-results/unit-test-report.html',
        includeFailureMsg: true,
        includeConsoleLog: true,
        styleOverridePath: 'test-results/govuk-theme.css',
        customScriptPath: 'interactive-filter.js',
        sort: 'status',
        executionTimeWarningThreshold: 5,
      },
    ],
  ],
};

module.exports = {
  testEnvironment: 'node',
  globalSetup: './tests/setup/jest.setup.js', // Initialize database before all tests
  setupFilesAfterEnv: ['./tests/setup/jest.setupAfterEnv.js'], // Load env vars for each test file
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    'src/**/*.ts',
    '!src/**/*.test.js',
    '!src/**/*.test.ts',
    '!src/**/tests/**',
  ],
  // Transform TypeScript and JavaScript files
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
  transformIgnorePatterns: [
    'node_modules/(?!(openid-client|oauth4webapi)/)', // Transform ESM modules
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  // Mock ESM modules that cause issues
  moduleNameMapper: {
    '^openid-client$': '<rootDir>/tests/__mocks__/openid-client.js',
    '^@aws-sdk/client-s3$': '<rootDir>/tests/__mocks__/@aws-sdk/client-s3.js',
    '^@aws-sdk/s3-request-presigner$': '<rootDir>/tests/__mocks__/@aws-sdk/s3-request-presigner.js',
  },
  // Set up test database environment variables
  setupFiles: ['<rootDir>/tests/setup.js'],
  // coverageThresholds: {
  //   global: {
  //     branches: 50,
  //     functions: 50,
  //     lines: 50,
  //     statements: 50,
  //   },
  // },
  verbose: true,
};

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.integration\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/integration/setup/global-setup.cjs',
  testTimeout: 60_000,
  maxWorkers: 1,
}

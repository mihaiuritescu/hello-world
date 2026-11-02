import { loadConfig, type Config } from '../config.ts'

/**
 * Configuration for integration tests: the dedicated test database and no log output. The rate
 * limits are high enough that no test meets one by accident; the tests of the limits set their own.
 */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_NAME: 'hello_world_test',
    RATE_LIMIT_API_PER_MINUTE: '100000',
    RATE_LIMIT_ROOMS_PER_MINUTE: '100000',
    RATE_LIMIT_MESSAGES_PER_MINUTE: '100000',
    ...overrides,
  })
}

import { loadConfig, type Config } from '../config.ts'

/** Configuration for integration tests: the dedicated test database and no log output. */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DB_NAME: 'hello_world_test',
    ...overrides,
  })
}

import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'client',
            environment: 'jsdom',
            include: ['src/client/**/*.test.ts', 'src/shared/**/*.test.ts'],
            setupFiles: ['src/client/test/setup.ts'],
            // Vuetify ships CSS imports that only Vite's pipeline can load.
            server: { deps: { inline: ['vuetify'] } },
          },
        },
        {
          test: {
            name: 'server',
            environment: 'node',
            include: ['src/server/**/*.test.ts'],
            globalSetup: ['src/server/test/global-setup.ts'],
            // Integration tests share one MySQL database, so test files run one at a time.
            fileParallelism: false,
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/*.test.ts', 'src/client/test/**', 'src/server/test/**'],
      },
    },
  }),
)

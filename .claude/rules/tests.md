---
paths:
  - "**/*.test.ts"
  - "src/client/test/**"
  - "src/server/test/**"
  - "e2e/**"
---

# Test rules

- Each test proves one behaviour and is named after it, for example `returns the stored message when the clientId repeats`.
- Never sleep or wait an arbitrary time.
  - Use `vi.useFakeTimers()` or `expect.poll`.
  - In Playwright, use web-first assertions such as `await expect(locator).toBeVisible()`.
- Ask of every test: "which broken implementation would still pass this?" If the answer is "many", tighten it.

## Server tests (Vitest, node, real MySQL)
- Build the app with `createTestApp()` from `src/server/test/test-app.ts`. It uses the `hello_world_test` database, which the global setup migrates.
- Reset tables between tests on one pinned connection, with foreign-key checks off, then truncate.
- Call routes with `app.inject()`. Use a real `listen({ port: 0 })` only for socket tests.

## Client tests (Vitest, jsdom)
- Mount with `createAppVuetify()` as a plugin.
- Query by role and label with `within(...)` from `@testing-library/dom`; avoid CSS selectors.
- Use a real `createPinia()` with mocked `lib/http.ts` and `lib/socket.ts`.
- jsdom has no layout. Test the Leaflet map in Playwright, not in Vitest.

## End-to-end tests (Playwright)
- Import `test` and `expect` from `e2e/fixtures.ts`. The fixture stubs the map tiles and fails a test on any browser console error, including CSP violations.
- Tag a test `@smoke` to also run it in WebKit.
- Tests run against the production build and the `hello_world_e2e` database.

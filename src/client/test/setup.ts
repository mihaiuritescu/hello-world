import '@testing-library/jest-dom/vitest'

// jsdom has no layout engine. Provide the browser APIs that Vuetify and VueUse expect.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

// Vuetify's overlays, such as the snackbar, read the visual viewport. Null makes them use the
// window instead.
globalThis.visualViewport ??= null

if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

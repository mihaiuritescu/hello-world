import { within } from '@testing-library/dom'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import ConnectionChip from './ConnectionChip.vue'

enableAutoUnmount(afterEach)

describe('ConnectionChip', () => {
  it.each([
    ['live', 'Live'],
    ['connecting', 'Connecting…'],
    ['reconnecting', 'Reconnecting…'],
  ] as const)('shows the %s status as "%s"', (status, text) => {
    mount(ConnectionChip, {
      props: { status },
      global: { plugins: [createAppVuetify()] },
      attachTo: document.body,
    })

    expect(within(document.body).getByRole('status', { name: 'Connection' })).toHaveTextContent(
      text,
    )
  })
})

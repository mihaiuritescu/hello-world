import { within } from '@testing-library/dom'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import ChatPanel from './ChatPanel.vue'

describe('ChatPanel', () => {
  it('invites the user to click on the map when no room is open', () => {
    const wrapper = mount(ChatPanel, { global: { plugins: [createAppVuetify()] } })
    const panel = within(wrapper.element.parentElement ?? document.body)

    expect(panel.getByRole('complementary', { name: 'Chat' })).toHaveTextContent(
      'Click on the map to start a chat',
    )
  })
})

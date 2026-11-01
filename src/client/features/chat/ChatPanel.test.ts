import type { Room } from '#shared/domain.ts'
import { within } from '@testing-library/dom'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createAppVuetify } from '../../plugins/vuetify.ts'
import ChatPanel from './ChatPanel.vue'

function renderPanel(room: Room | null) {
  const wrapper = mount(ChatPanel, {
    props: { room },
    global: { plugins: [createAppVuetify()] },
    attachTo: document.body,
  })
  return { wrapper, screen: within(document.body) }
}

describe('ChatPanel', () => {
  it('invites the user to click on the map, or press Enter on it, when no room is open', () => {
    const { wrapper, screen } = renderPanel(null)

    const panel = screen.getByRole('complementary', { name: 'Chat' })
    expect(panel).toHaveTextContent('Click on the map to start a chat')
    expect(panel).toHaveTextContent('or focus the map and press Enter')
    wrapper.unmount()
  })

  it('shows the open room as "Chatroom N"', () => {
    const { wrapper, screen } = renderPanel({
      id: 7,
      lat: 1,
      lng: 2,
      createdAt: '2026-11-02T10:00:00.000Z',
    })

    expect(screen.getByRole('heading', { name: 'Chatroom 7' })).toBeVisible()
    expect(screen.queryByText('Click on the map to start a chat')).not.toBeInTheDocument()
    wrapper.unmount()
  })
})

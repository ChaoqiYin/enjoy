import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '../src/shared/i18n'

// jsdom lays nothing out and implements no scrolling, which is what Radix
// reaches for when it brings a highlighted option into view.
Element.prototype.scrollIntoView = vi.fn()

// jsdom answers `element.matches(':modal')` by recursing through nwsapi, which
// costs about 180ms a call; floating-ui asks every ancestor of a floating
// panel that question when it opens. Nothing here is a top-layer element, so
// answering `false` outright is both correct and instant.
const matches = Element.prototype.matches
Element.prototype.matches = function (selector: string): boolean {
  if (selector === ':modal') return false
  return matches.call(this, selector)
}

afterEach(() => {
  cleanup()
})

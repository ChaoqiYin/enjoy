import type { ReactElement } from 'react'
import Home from './pages/Home'

/**
 * Project body entry.
 *
 * The first version keeps the layout minimal: `app.json` declares no `ui`
 * capabilities, so there are no plugin outlets, slots, menus or settings
 * panels to render.
 */
export default function Body(): ReactElement {
  return <Home />
}

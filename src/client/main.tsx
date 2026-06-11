/** @jsxImportSource react */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Experience } from './scene/Experience'

// Mount point is the fixed full-viewport <div id="scene"> rendered by the Hono
// SSR Layout. Everything here is progressive enhancement over server HTML.
const mount = document.getElementById('scene')
if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <Experience />
    </StrictMode>,
  )
}

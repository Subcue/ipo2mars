/** @jsxImportSource react */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasExperience } from './AtlasExperience'

const mount = document.getElementById('atlas')
if (mount) {
  // Hide the SSR fallback blurb once the interactive stage takes over.
  document.documentElement.classList.add('atlas-ready')
  createRoot(mount).render(
    <StrictMode>
      <AtlasExperience />
    </StrictMode>,
  )
}

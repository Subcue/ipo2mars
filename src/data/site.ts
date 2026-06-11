// Single source of site-wide facts. Keep copy here so pages stay declarative.

export const SITE = {
  name: 'ipo2mars',
  url: 'https://ipo2mars.com',
  tagline: "IPO is not the destination. It's the launchpad.",
  description:
    'An unofficial open-source 3D visualization of SpaceX’s arc — from reusable rockets and the live Starlink constellation to its record-breaking IPO, orbital AI, and a self-sustaining Mars city.',
  repo: 'https://github.com/Subcue/ipo2mars',
  twitter: '@subcueai',
}

// The legal line shown on every page and baked into structured data. SpaceX,
// Starlink, xAI and Tesla are trademarks of their owners; this is commentary.
export const DISCLAIMER =
  'Unofficial fan project. Not affiliated with, endorsed by, or sponsored by SpaceX, Starlink, xAI, Tesla, or Elon Musk. Nothing here is investment advice.'

export interface NavLink {
  href: string
  label: string
}

export const NAV: NavLink[] = [
  { href: '/spacex-ipo', label: 'IPO' },
  { href: '/starlink', label: 'Starlink' },
  { href: '/spacex-ai', label: 'Space × AI' },
  { href: '/mars', label: 'Mars' },
]

import { SITE, DISCLAIMER } from '../data/site'

export interface PageSchema {
  path: string
  title: string
  description: string
}

// JSON-LD graph emitted into every page <head>. The disclaimer is baked into
// the CreativeWork node so AI engines and rich-result parsers see the
// "unofficial / not investment advice" stance as structured data, not just
// body copy — mirrors the entity-SEO discipline of subcue's corp site.
export function buildGraph(page: PageSchema): object[] {
  const canonical = `${SITE.url}${page.path === '/' ? '/' : page.path}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      inLanguage: 'en',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: page.title,
      headline: page.title,
      url: canonical,
      description: page.description,
      abstract: DISCLAIMER,
      about: 'SpaceX, Starlink, orbital AI, and Mars settlement',
      keywords: 'SpaceX IPO, SPCX, Starlink, Mars colonization, open source 3D',
      license: 'https://opensource.org/licenses/MIT',
      isAccessibleForFree: true,
      creditText: 'ipo2mars — open source',
    },
  ]
}

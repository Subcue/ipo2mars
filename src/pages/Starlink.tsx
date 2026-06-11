import type { FC } from 'hono/jsx'
import { Article, Block, Note, NextLinks, StatStrip } from '../components/Article'

const STATS = [
  { value: '9M+', label: 'subscribers' },
  { value: '~550 km', label: 'orbital altitude' },
  { value: '53°', label: 'primary inclination' },
  { value: 'Live', label: 'from CelesTrak data' },
]

export const Starlink: FC = () => (
  <Article
    eyebrow="Low Earth orbit"
    title="The Starlink mesh"
    lede="Thousands of satellites in low Earth orbit, knitting the planet into a single network. It is also the revenue engine underneath the IPO story."
  >
    <StatStrip stats={STATS} />

    <Block heading="What you're seeing">
      <p>
        The globe on the home page isn't decorative. Each point is a real Starlink satellite, placed
        from public two-line element (TLE) orbital data published by CelesTrak and propagated in your
        browser with an SGP4 model, the same math used to track objects in orbit.
      </p>
      <p>
        Positions update continuously as the satellites move at roughly 7.5 km/s, completing an orbit
        about every 95 minutes. The constellation's tilted shells, most prominently around 53° of
        inclination, are why coverage concentrates between the mid-latitudes.
      </p>
    </Block>

    <Block heading="Why it matters for the IPO">
      <p>
        Starlink turned a hardware company into a recurring-revenue one. With more than nine million
        subscribers and an expanding direct-to-cell effort, it is the part of the business investors
        can model, and a large part of why demand for the listing ran multiples past the raise.
      </p>
    </Block>

    <Note>
      Satellite positions are illustrative of the live constellation, derived from public CelesTrak
      TLE data; they are not a navigation-grade feed. ipo2mars is unofficial and not affiliated with
      SpaceX or Starlink.
    </Note>

    <NextLinks
      links={[
        { href: '/spacex-ipo', label: '← IPO Mission Control' },
        { href: '/spacex-ai', label: 'Space × AI →' },
        { href: '/moon', label: 'The Moon →' },
      ]}
    />
  </Article>
)

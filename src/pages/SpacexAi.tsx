import type { FC } from 'hono/jsx'
import { Article, Block, Note, NextLinks } from '../components/Article'

export const SpacexAi: FC = () => (
  <Article
    eyebrow="Orbital compute"
    title="Space × AI"
    lede="After a 2026 merger, xAI sits inside SpaceX. The line between rockets and AI is now part of the same balance sheet — and part of the same pitch."
  >
    <Block heading="What's real today">
      <p>
        SpaceX and xAI — the company behind Grok — combined in 2026, folding a frontier AI lab into
        the same entity that flies more orbital launches per year than the rest of the world combined.
        That pairing is one of the threads investors are buying into at the listing.
      </p>
      <p>
        The grounded version of "Space × AI" is already here: AI for autonomy and landing, models
        trained on vast launch and Earth-observation data, and an AI product line now under the same
        roof as the launch and Starlink businesses.
      </p>
    </Block>

    <Block heading="What's still speculative">
      <p>
        The headline-grabbing version — data centers in orbit, solar-powered compute above the
        atmosphere, an "AI layer" riding the satellite mesh — is a future scenario, not a shipped
        product. It's a useful way to imagine where cheap launch plus abundant power could lead, and
        we visualize it as exactly that: a possibility, not a roadmap.
      </p>
    </Block>

    <Note>
      Speculative future scenarios on this page are illustrative, not official SpaceX or xAI plans.
      Merger and business facts cite public reporting (verified 2026-06-11). ipo2mars is unofficial,
      not affiliated with SpaceX or xAI, and not investment advice.
    </Note>

    <NextLinks
      links={[
        { href: '/starlink', label: '← Starlink' },
        { href: '/mars', label: 'On to Mars →' },
        { href: '/spacex-ipo', label: 'IPO Mission Control →' },
      ]}
    />
  </Article>
)

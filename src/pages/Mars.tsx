import type { FC } from 'hono/jsx'
import { Article, Block, Note, NextLinks } from '../components/Article'

export const Mars: FC = () => (
  <Article
    eyebrow="The destination"
    title="From IPO to a city on Mars"
    lede="Reusable rockets pay for Starlink. Starlink pays for Starship. Starship is the vehicle for the actual goal, and the IPO is just the launchpad."
  >
    <Block heading="The transfer window">
      <p>
        Earth and Mars line up for an efficient crossing only about every 26 months. Each window is a
        narrow door: miss it and the next one is more than two years away. Starship is designed to send
        cargo and, eventually, people through those doors at a cadence no vehicle ever has.
      </p>
    </Block>

    <Block heading="The hundred-year plan, in public">
      <p>
        The stated ambition is a self-sustaining city on the order of a million people, able to
        survive even if the ships from Earth stop coming. That is a multi-decade, aspirational goal,
        not a dated milestone, and we treat it as such: a direction, visualized.
      </p>
      <p>
        What makes it more than a slide is the funding chain. A public SpaceX with Starlink revenue and
        capital-markets access is, in this telling, how the Mars program gets paid for. Hence the
        framing of this whole project: <em>IPO is not the destination. It's the launchpad.</em>
      </p>
    </Block>

    <Block heading="Coming soon: the settlement simulator">
      <p>
        A planned interactive: set Starship flights per window, cargo per flight, power source, and
        population growth, then watch the model estimate when a Mars city becomes self-sustaining.
        It is the next thing we are building in public, and contributions are welcome.
      </p>
    </Block>

    <Note>
      Forward-looking and aspirational statements describe publicly stated goals, not commitments or
      schedules. ipo2mars is unofficial, not affiliated with SpaceX, and not investment advice.
    </Note>

    <NextLinks
      links={[
        { href: '/moon', label: '← The Moon, first' },
        { href: '/spacex-ipo', label: 'IPO Mission Control' },
        { href: 'https://github.com/Subcue/ipo2mars', label: 'Contribute the simulator' },
      ]}
    />
  </Article>
)

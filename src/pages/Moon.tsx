import type { FC } from 'hono/jsx'
import { Article, Block, Note, NextLinks } from '../components/Article'

const STATS = [
  { value: 'Apr 2026', label: 'Artemis II crewed lunar flyby — flown' },
  { value: 'NET 2027', label: 'Artemis III docking demo with HLS' },
  { value: '~2028', label: 'first crewed landing (Artemis IV)' },
  { value: 'HLS', label: 'Starship lunar lander, under contract' },
]

export const Moon: FC = () => (
  <Article
    eyebrow="The proving ground"
    title="The Moon, first"
    lede="Before Starship points at Mars, it lands on the Moon. SpaceX's lunar lander is the contracted centerpiece of NASA's return — and every lunar milestone is a dress rehearsal for the Mars architecture."
  >
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {STATS.map((s) => (
        <div class="panel rounded-2xl p-5">
          <p class="text-2xl font-semibold tracking-tight">{s.value}</p>
          <p class="mt-1 text-xs text-white/50">{s.label}</p>
        </div>
      ))}
    </div>

    <Block heading="Where the program stands">
      <p>
        In April 2026, Artemis II carried four astronauts around the Moon and back — the first crewed
        lunar flyby in more than fifty years, traveling farther from Earth than any humans before
        them. That mission flew on NASA's SLS and Orion; what it proved out is the path SpaceX's
        hardware now plugs into.
      </p>
      <p>
        Artemis III has been reprofiled as a crewed low-Earth-orbit rendezvous-and-docking
        demonstration with a Starship HLS pathfinder, targeted no earlier than 2027 — its crew was
        announced on June 9, 2026. The first crewed lunar landing is now targeted for Artemis IV in
        early 2028, descending to the surface on SpaceX's Starship HLS.
      </p>
    </Block>

    <Block heading="Starship HLS — the lander">
      <p>
        The Human Landing System is a lunar variant of the same Starship that headlines the IPO
        story: refueled in orbit, no heat shield or flaps needed for an airless Moon, and enough
        cabin volume to dwarf anything that has landed there before. NASA's stated posture is
        risk-reduction-first — the landing schedule is gated on Starship's iterative flight tests,
        not on calendar pressure.
      </p>
    </Block>

    <Block heading="Why the Moon is the dress rehearsal for Mars">
      <p>
        Orbital refueling, long-duration life support, precision landing on unprepared terrain,
        surface operations — every one of these is a Mars prerequisite that the lunar program forces
        SpaceX to prove years earlier, with NASA paying part of the bill. In this site's framing:
        the IPO funds the ships, the Moon proves them, and Mars is where they are pointed.
      </p>
    </Block>

    <Note>
      Program facts cite NASA and public reporting, last verified 2026-06-12. Timelines are targets
      and shift with flight-test progress. ipo2mars is unofficial and not affiliated with NASA or
      SpaceX. Not investment advice.
    </Note>

    <NextLinks
      links={[
        { href: '/spacex-ai', label: '← Space × AI' },
        { href: '/mars', label: 'On to Mars →' },
        { href: '/spacex-ipo', label: 'IPO Mission Control' },
      ]}
    />
  </Article>
)

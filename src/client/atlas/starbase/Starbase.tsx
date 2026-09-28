/** @jsxImportSource react */
import { Suspense, useMemo } from 'react'
import type { ModelContext } from '../render/materials'
import { MODELS, useEnv, useModel } from '../render/useModel'
import { SITE_QUAT, SITE_SCALE, STARBASE_POS } from '../stage'
import { StarbaseGround } from './Ground'
import { StarbaseLaunch } from './StarbaseLaunch'
import { PAD_GRADE, SITE_HAZE } from './state'

// Starbase, Boca Chica: the launch site at the top of the atlas Earth. Local
// axes are world axes (x east, z south, y up); the ground is built in stage
// units, everything else in metres under a SITE_SCALE group standing on the
// graded pad level. Site models bend onto the planet's curve (the production
// site is kilometres away), see materials.ts `curve`.
function SiteModel() {
  const env = useEnv('earth')
  const ctx = useMemo<ModelContext>(() => ({ env, envIntensity: 0.9, haze: SITE_HAZE, curve: SITE_SCALE / 2 }), [env])
  const model = useModel(MODELS.starbase, ctx)
  return <primitive object={model} />
}

export function Starbase({ visible, load }: { visible: boolean; load: boolean }) {
  const env = useEnv('earth')
  return (
    <group position={STARBASE_POS} quaternion={SITE_QUAT} visible={visible}>
      <StarbaseGround env={env} visible={visible} />
      <group position={[0, PAD_GRADE * SITE_SCALE, 0]} scale={SITE_SCALE}>
        {/* Streams in on its own: never holds up the rest of the stage. */}
        {load ? (
          <Suspense fallback={null}>
            <SiteModel />
            <StarbaseLaunch env={env} active={visible} />
          </Suspense>
        ) : null}
      </group>
    </group>
  )
}

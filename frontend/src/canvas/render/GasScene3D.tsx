import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import { tokens } from '../design/tokens'
import {
  advanceParticles,
  densityScale,
  PARTICLE_COUNT,
  particleSpeed,
  seedParticles,
  volumeScale,
} from './gasModel'

/**
 * The gas, in three dimensions.
 *
 * LAZY-LOADED ON PURPOSE — THIS FILE IS THE REASON THE SPLIT EXISTS
 * ----------------------------------------------------------------
 * three.js is roughly 600 KB before a single sphere is drawn, and most readers
 * never touch the 3D toggle. So `SimulationView` reaches this module through
 * `React.lazy` and NOTHING may import it at the top level of the initial
 * bundle. If you ever need a type from here, import it with `import type` — a
 * value import from `SimulationView` would quietly undo the whole split and
 * nothing would look broken.
 *
 * TRANSPARENT, DELIBERATELY
 * -------------------------
 * `alpha: true` with no scene background, so the lit gradient of the page shows
 * through the canvas and the panel reads as one surface. `flat` turns off
 * r3f's default ACES tone mapping, which otherwise desaturates the accent
 * towards a dull olive and takes the glow with it.
 *
 * LAW 4: not one colour is typed here. Every one is `new THREE.Color(token)`,
 * because three.js needs a numeric colour and cannot read a CSS custom property.
 * Only the solid tokens are usable — `tokens.color.line` and its neighbours are
 * channel-separated strings with an alpha, which THREE.Color cannot parse.
 */

export interface GasSceneProps {
  temperatureK: number
  volumeL: number
  moles: number
  /** `prefers-reduced-motion`: hold the gas as a still frame. */
  still: boolean
}

/* World units. Structural geometry, not a design scale. */
const BASE_EDGE = 1.7
const BASE_RADIUS = 0.05

export default function GasScene3D({ temperatureK, volumeL, moles, still }: GasSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      flat
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [2.4, 1.7, 2.9], fov: 42 }}
      /* Reduced motion stops the render loop outright rather than drawing the
         same frame sixty times a second. React commits and OrbitControls both
         still invalidate, so dragging and slider changes keep repainting. */
      frameloop={still ? 'demand' : 'always'}
      style={{ display: 'block', width: '100%', aspectRatio: '16 / 10' }}
    >
      <Lighting />
      <Container volumeL={volumeL} />
      <Gas temperatureK={temperatureK} volumeL={volumeL} moles={moles} still={still} />
      <OrbitControls makeDefault enablePan={false} enableZoom={false} autoRotate={!still} autoRotateSpeed={0.5} />
    </Canvas>
  )
}

export { GasScene3D }

/* -------------------------------------------------------------------------- */
/* Lighting — the expensive look comes from here, not from more colours       */
/* -------------------------------------------------------------------------- */

function Lighting() {
  const key = useMemo(() => new THREE.Color(tokens.color.accentSoft), [])
  const fill = useMemo(() => new THREE.Color(tokens.color.result), [])

  return (
    <>
      <ambientLight intensity={0.7} />
      {/* Lit from above, matching the page's own gradient. */}
      <pointLight position={[2.5, 4, 2.5]} intensity={26} color={key} />
      <pointLight position={[-3, -1.5, -2]} intensity={9} color={fill} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* The container                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A transparent-walled box whose edge follows the cube root of the volume.
 *
 * Outline plus one very faint back face: an opaque box would hide the gas, and
 * a wireframe alone gives the eye nothing to read depth against.
 */
function Container({ volumeL }: { volumeL: number }) {
  const edge = BASE_EDGE * volumeScale(volumeL)

  const line = useMemo(() => new THREE.Color(tokens.color.accent), [])
  const wall = useMemo(() => new THREE.Color(tokens.color.inkFaint), [])

  /* Memoised and disposed by hand: a geometry rebuilt inline on every render
     leaks GPU buffers, and a volume slider re-renders on every pointer move. */
  const edges = useMemo(() => {
    const box = new THREE.BoxGeometry(edge, edge, edge)
    const wire = new THREE.EdgesGeometry(box)
    box.dispose()
    return wire
  }, [edge])

  useEffect(() => () => edges.dispose(), [edges])

  return (
    <group>
      <mesh>
        <boxGeometry args={[edge, edge, edge]} />
        <meshBasicMaterial
          color={wall}
          side={THREE.BackSide}
          transparent
          opacity={0.07}
          depthWrite={false}
        />
      </mesh>

      <lineSegments geometry={edges}>
        <lineBasicMaterial color={line} transparent opacity={0.5} />
      </lineSegments>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* The gas                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The particles, as ONE InstancedMesh.
 *
 * Twenty-eight separate meshes would be twenty-eight draw calls and twenty-eight
 * React nodes reconciled every frame. One instanced mesh is a single draw call
 * and a single matrix buffer, which is the difference between a scene that holds
 * 60 fps next to an animated SVG and one that does not.
 */
function Gas({ temperatureK, volumeL, moles, still }: GasSceneProps) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  /* Seeded once and mutated in place — the same cloud the 2D view is showing. */
  const particles = useMemo(() => seedParticles(PARTICLE_COUNT), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  const body = useMemo(() => new THREE.Color(tokens.color.accent), [])
  const glow = useMemo(() => new THREE.Color(tokens.color.accentDeep), [])

  const edge = BASE_EDGE * volumeScale(volumeL)
  const speed = particleSpeed(temperatureK)
  const radius = densityScale(moles)

  useFrame((_, delta) => {
    const instances = mesh.current
    if (!instances) return

    if (!still) advanceParticles(particles, delta, speed)

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i]
      if (!p) continue

      // The model guarantees finite, unit-box coordinates. Trusting that
      // without checking is how a blank scene happens, so it is checked.
      const x = (p.x - 0.5) * edge
      const y = (p.y - 0.5) * edge
      const z = (p.z - 0.5) * edge
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue

      dummy.position.set(x, y, z)
      dummy.scale.setScalar(radius)
      dummy.updateMatrix()
      instances.setMatrixAt(i, dummy.matrix)
    }

    instances.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
      <sphereGeometry args={[BASE_RADIUS, 16, 12]} />
      {/* Emissive rather than bright: glow, never fill — a lit particle reads as
          energy, a flat-filled one reads as a bead. */}
      <meshStandardMaterial
        color={body}
        emissive={glow}
        emissiveIntensity={0.85}
        roughness={0.28}
        metalness={0.12}
      />
    </instancedMesh>
  )
}

import React, { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { ModelStore } from '../model/modelStore'

/* PANEL ① / ⑤ — a glass box of gas, in WebGL, telling the truth about speed.
 *
 * THE PHYSICS IS REAL, NOT A LOOKUP. Root-mean-square molecular speed goes as
 * √T, so a particle's velocity here is scaled by √(T/T₀) and nothing else.
 * Raise the thermometer and the particles genuinely move faster by the right
 * factor; the pressure readout elsewhere on the board is computed from the
 * same T through PV = nRT, so the two can never drift apart.
 *
 * ONE DRAW CALL PER LAYER, NOT PER PARTICLE. Core, halo and trail are three
 * InstancedMeshes whose matrices are rewritten each frame. Sixty particles is
 * three draw calls; six hundred would still be three. That headroom is the
 * reason this component can be reused for electrons, planets or blood cells
 * without being rewritten.
 *
 * SEEDED, NEVER Math.random. Positions come from a hash of the index, so the
 * same box renders identically on every load and a screenshot test is stable.
 */

/* THE RENDERER SETTINGS, NAMED SO THEY CAN BE ASSERTED.
 *
 * Inline in the JSX this was a magic object literal that looked like noise and
 * invited tidying back to the default. It is not noise: r3f defaults to
 * ACESFilmic tone mapping, a film curve that rolls highlights toward white,
 * and an emissive cyan particle IS a highlight — the curve desaturated every
 * one of them and the box rendered as a wireframe full of grey dust. These
 * particles are a diagram drawn in a chosen colour, not photographic light.
 * Exported because a test asserts it, so the next person to "clean this up"
 * gets a failure instead of a silently grey scene. */
export const CANVAS_GL = {
  antialias: true,
  alpha: true,
  toneMapping: THREE.NoToneMapping,
} as const

const COUNT = 22
/* Half-extent of the cube interior. Particles bounce inside ±LIMIT. */
const LIMIT = 0.86
const BASE_SPEED = 0.42

function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

interface Particle { p: THREE.Vector3; v: THREE.Vector3 }

function makeParticles(): Particle[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const dir = new THREE.Vector3(
      seeded(i, 1) * 2 - 1,
      seeded(i, 2) * 2 - 1,
      seeded(i, 3) * 2 - 1,
    )
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0)
    dir.normalize()
    return {
      p: new THREE.Vector3(
        (seeded(i, 4) * 2 - 1) * LIMIT * 0.9,
        (seeded(i, 5) * 2 - 1) * LIMIT * 0.9,
        (seeded(i, 6) * 2 - 1) * LIMIT * 0.9,
      ),
      v: dir.multiplyScalar(BASE_SPEED * (0.75 + seeded(i, 7) * 0.5)),
    }
  })
}

function Swarm({ speedRef, showVectors }: { speedRef: React.MutableRefObject<number>; showVectors: boolean }) {
  const core = useRef<THREE.InstancedMesh>(null)
  const halo = useRef<THREE.InstancedMesh>(null)
  const trail = useRef<THREE.InstancedMesh>(null)

  const particles = useMemo(makeParticles, [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const dir = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDelta) => {
    /* Clamp the step so a backgrounded tab does not resume with every particle
     * teleported through a wall. */
    const dt = Math.min(rawDelta, 1 / 30)
    const speed = speedRef.current

    for (let i = 0; i < particles.length; i++) {
      const q = particles[i]
      q.p.addScaledVector(q.v, dt * speed)

      /* Elastic wall collision: reflect the component, and clamp back inside so
       * a large step cannot leave the particle outside the glass. */
      if (q.p.x > LIMIT) { q.p.x = LIMIT; q.v.x = -q.v.x } else if (q.p.x < -LIMIT) { q.p.x = -LIMIT; q.v.x = -q.v.x }
      if (q.p.y > LIMIT) { q.p.y = LIMIT; q.v.y = -q.v.y } else if (q.p.y < -LIMIT) { q.p.y = -LIMIT; q.v.y = -q.v.y }
      if (q.p.z > LIMIT) { q.p.z = LIMIT; q.v.z = -q.v.z } else if (q.p.z < -LIMIT) { q.p.z = -LIMIT; q.v.z = -q.v.z }

      dummy.position.copy(q.p)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      core.current?.setMatrixAt(i, dummy.matrix)

      dummy.scale.setScalar(2.7)
      dummy.updateMatrix()
      halo.current?.setMatrixAt(i, dummy.matrix)

      if (trail.current) {
        /* A stretched box laid along the velocity vector reads as a motion
         * streak, and its LENGTH is the speed — the visual cue is the datum. */
        dir.copy(q.v).normalize()
        quat.setFromUnitVectors(up, dir)
        dummy.position.copy(q.p).addScaledVector(dir, -0.055 * speed)
        dummy.quaternion.copy(quat)
        dummy.scale.set(1, Math.max(0.4, speed) * 1.5, 1)
        dummy.updateMatrix()
        trail.current.setMatrixAt(i, dummy.matrix)
      }
    }

    if (core.current) core.current.instanceMatrix.needsUpdate = true
    if (halo.current) halo.current.instanceMatrix.needsUpdate = true
    if (trail.current) trail.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      {showVectors && (
        <instancedMesh ref={trail} args={[undefined, undefined, COUNT]} frustumCulled={false}>
          <cylinderGeometry args={[0.008, 0.028, 0.16, 6]} />
          <meshBasicMaterial color="#5eead4" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
      )}
      <instancedMesh ref={halo} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.062, 12, 12]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={core} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <sphereGeometry args={[0.062, 16, 16]} />
        <meshStandardMaterial color="#d8f6ff" emissive="#2ad4ee" emissiveIntensity={3.4} roughness={0.25} />
      </instancedMesh>
    </>
  )
}

function GlassCube() {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2, 2, 2)), [])
  return (
    <group>
      <mesh>
        <boxGeometry args={[2, 2, 2]} />
        {/* Frosted, not mirrored: the learner must see the particles through it. */}
        {/* Frosted, and actually visible. transmission needs the renderer's
          * separate transmission pass to show anything; at opacity 0.10 with
          * it half-on, the faces rendered as very nearly nothing and the box
          * read as a wireframe. A plain physical material with real opacity
          * gives the reference's frosted slab, and costs one pass instead of
          * two. */}
        <meshPhysicalMaterial
          color="#bcdfeb"
          transparent
          opacity={0.15}
          roughness={0.18}
          metalness={0}
          clearcoat={0.6}
          clearcoatRoughness={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#cfeaf3" transparent opacity={0.7} />
      </lineSegments>
    </group>
  )
}

function Rig({ store, tempVar, showVectors }: { store: ModelStore; tempVar: string; showVectors: boolean }) {
  /* Speed is read into a ref rather than state: the swarm must not remount on
   * every slider tick, and useFrame does not need a re-render to see a ref. */
  const speedRef = useRef(1)
  useFrame(() => {
    const r = store.getResolved()
    const t = r.scope[tempVar]
    /* Baseline is the variable's own declared minimum, so "1× speed" means
     * "the speed at the coldest temperature this lesson lets you reach" — a
     * statement the board can actually defend. */
    const t0 = r.domains[tempVar]?.[0] ?? 1
    speedRef.current = typeof t === 'number' && t > 0 && t0 > 0 ? Math.sqrt(t / t0) : 1
  })

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-3, -2, -3]} intensity={0.5} color="#22d3ee" />
      <GlassCube />
      <Swarm speedRef={speedRef} showVectors={showVectors} />
    </>
  )
}

export function ParticleBox3D({
  store,
  tempVar,
  width,
  height,
  showVectors = true,
  spin = -0.32,
}: {
  store: ModelStore
  tempVar: string
  width: number
  height: number
  showVectors?: boolean
  /** Fixed camera yaw, in radians. The box is posed, not orbited. */
  spin?: number
}) {
  const camera = useMemo(() => {
    const r = 4.4
    return { position: [Math.sin(spin) * r, 1.5, Math.cos(spin) * r] as [number, number, number], fov: 34 }
  }, [spin])

  return (
    <div style={{ width, height }}>
      <Canvas
        camera={camera}
        dpr={[1, 2]}
        gl={CANVAS_GL}
        style={{ width: '100%', height: '100%' }}
      >
        <Rig store={store} tempVar={tempVar} showVectors={showVectors} />
      </Canvas>
    </div>
  )
}

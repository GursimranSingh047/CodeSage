import React, { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Hero background: a sparse 3D field of small glowing mint nodes with faint
 * curved connectors, drifting slowly, with subtle mouse parallax.
 * Deliberately low-key — decoration, not the content.
 */

type NodeSpec = { base: [number, number, number]; phase: number; speed: number; size: number };

function makeNodes(count: number, seed = 7): NodeSpec[] {
  // deterministic pseudo-random so the field is stable across reloads
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, () => ({
    base: [(rand() - 0.5) * 26, (rand() - 0.5) * 14, (rand() - 0.5) * 8 - 2] as [number, number, number],
    phase: rand() * Math.PI * 2,
    speed: 0.15 + rand() * 0.25,
    size: 0.05 + rand() * 0.09,
  }));
}

const NODES = makeNodes(34);

// faint curved connectors between selected node pairs
const LINK_PAIRS: Array<[number, number]> = [
  [0, 5], [2, 8], [3, 11], [4, 14], [6, 17], [7, 20], [9, 22],
  [10, 25], [12, 27], [13, 30], [15, 31], [16, 33], [18, 21], [23, 28],
];

function NodesAndLinks() {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  const nodes = useMemo(
    () =>
      NODES.map((n) => ({
        ...n,
        color: new THREE.Color().setHSL(0.4 + (n.phase % 0.08), 0.55, 0.62),
      })),
    []
  );
  const curves = useMemo(
    () =>
      LINK_PAIRS.map(([a, b]) => {
        const p0 = new THREE.Vector3(...NODES[a].base);
        const p2 = new THREE.Vector3(...NODES[b].base);
        const mid = p0.clone().add(p2).multiplyScalar(0.5);
        mid.y += 1.2;
        mid.z -= 1.5;
        const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
        return new THREE.TubeGeometry(curve, 24, 0.012, 6, false);
      }),
    []
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const spec = NODES[i % NODES.length];
      if ((child as THREE.Mesh).geometry instanceof THREE.SphereGeometry) {
        child.position.set(
          spec.base[0] + Math.sin(t * spec.speed + spec.phase) * 0.5,
          spec.base[1] + Math.cos(t * spec.speed * 0.8 + spec.phase) * 0.35,
          spec.base[2] + Math.sin(t * spec.speed * 0.5) * 0.25
        );
      }
    });
    // gentle mouse parallax
    group.current.rotation.y += (pointer.x * 0.12 - group.current.rotation.y) * 0.03;
    group.current.rotation.x += (pointer.y * 0.08 - group.current.rotation.x) * 0.03;
  });

  return (
    <group ref={group}>
      {nodes.map((n, i) => (
        <mesh key={i} position={n.base}>
          <sphereGeometry args={[n.size, 12, 12]} />
          <meshBasicMaterial color={n.color} transparent opacity={0.85} />
        </mesh>
      ))}
      {curves.map((g, i) => (
        <line key={`l${i}`}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color="#1a3d2a" transparent opacity={0.5} />
        </line>
      ))}
    </group>
  );
}

export default function HeroNodeField() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 14], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <NodesAndLinks />
      </Canvas>
    </div>
  );
}

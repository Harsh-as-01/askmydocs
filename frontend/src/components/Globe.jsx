/**
 * The vector-space globe — a real 3D view of the session's index.
 *
 * Every point is one chunk of the uploaded documents, positioned by a
 * random projection of its 1024-d embedding onto the unit sphere (computed
 * server-side), so related chunks cluster together. When a question is
 * asked, the retrieved chunks pulse red: you can literally watch cosine
 * similarity search happen.
 *
 * Animation ("frame generation") runs on react-three-fiber's useFrame —
 * a requestAnimationFrame loop:
 *   - the whole globe drifts slowly (rotation + slight tilt)
 *   - on upload, points fly from a wide random shell to their true
 *     positions with cubic easing (~1.4s)
 *   - highlighted points pulse and glow red, then fade over ~6s
 *
 * This module is lazy-loaded (it pulls in three.js, ~150KB gz) so the chat
 * UI itself stays fast. If WebGL is unavailable the app renders a static
 * fallback instead of mounting this at all.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Falls back to the original Carbon palette if a theme isn't supplied.
const DEFAULT_GLOBE = { point: '#9a9a9a', line: '#ffffff', highlight: '#e24b4a', wire: 0.035, ring: 1 };
const POINT_RADIUS = 0.016;
const FLY_IN_MS = 1400;
const GLOW_MS = 6000;

/** A thin great-circle ring, like a longitude/latitude line. */
function Ring({ rotation, opacity, color }) {
  const geometry = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <lineLoop geometry={geometry} rotation={rotation}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineLoop>
  );
}

/** Instanced point cloud with fly-in and highlight pulse animation. */
function ChunkCloud({ points, highlight, theme }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseColor = useMemo(() => new THREE.Color(theme.point), [theme.point]);
  const highlightColor = useMemo(() => new THREE.Color(theme.highlight), [theme.highlight]);

  // Per-batch animation state: where each point starts (random far shell)
  // and where it belongs (its projected embedding position).
  const anim = useMemo(() => {
    const start = new Float32Array(points.length * 3);
    const target = new Float32Array(points.length * 3);
    const v = new THREE.Vector3();
    points.forEach((p, i) => {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(2.2);
      start.set([v.x, v.y, v.z], i * 3);
      target.set(p.pos, i * 3);
    });
    return { start, target, t0: performance.now() };
  }, [points]);

  const highlightIds = useMemo(() => new Set(highlight?.ids ?? []), [highlight]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = performance.now();

    // Fly-in progress with cubic ease-out.
    const raw = Math.min((now - anim.t0) / FLY_IN_MS, 1);
    const ease = 1 - Math.pow(1 - raw, 3);

    // Highlight envelope: pulse while fresh, fade to zero over GLOW_MS.
    const sinceGlow = highlight ? now - highlight.ts : Infinity;
    const fade = Math.max(0, 1 - sinceGlow / GLOW_MS);
    const pulse = 0.65 + 0.35 * Math.sin(now * 0.008);

    for (let i = 0; i < points.length; i++) {
      const j = i * 3;
      dummy.position.set(
        anim.start[j] + (anim.target[j] - anim.start[j]) * ease,
        anim.start[j + 1] + (anim.target[j + 1] - anim.start[j + 1]) * ease,
        anim.start[j + 2] + (anim.target[j + 2] - anim.start[j + 2]) * ease
      );
      const hot = highlightIds.has(points[i].id) ? fade * pulse : 0;
      dummy.scale.setScalar(1 + hot * 2.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, hot > 0.01 ? baseColor.clone().lerp(highlightColor, Math.min(hot * 1.6, 1)) : baseColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, points.length]} key={points.length}>
      <sphereGeometry args={[POINT_RADIUS, 10, 10]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Scene root: slow drift rotation applied to everything. */
function Scene({ points, highlight, theme }) {
  const group = useRef();

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.12;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.18;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 28, 18]} />
        <meshBasicMaterial wireframe color={theme.line} transparent opacity={theme.wire} />
      </mesh>
      <Ring rotation={[Math.PI / 2, 0, 0]} opacity={0.14 * theme.ring} color={theme.line} />
      <Ring rotation={[Math.PI / 2.6, 0.4, 0]} opacity={0.08 * theme.ring} color={theme.line} />
      <Ring rotation={[0.3, Math.PI / 2.2, 0.2]} opacity={0.08 * theme.ring} color={theme.line} />
      {points.length > 0 && <ChunkCloud points={points} highlight={highlight} theme={theme} />}
    </group>
  );
}

/** Ambient placeholder points shown before any document is uploaded. */
function useAmbientPoints() {
  return useMemo(() => {
    const v = new THREE.Vector3();
    return Array.from({ length: 110 }, (_, i) => {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      return { id: -1 - i, pos: [v.x, v.y, v.z] };
    });
  }, []);
}

export default function Globe({ points, highlight, theme = DEFAULT_GLOBE }) {
  const ambient = useAmbientPoints();
  const shown = points.length > 0 ? points : ambient;

  return (
    <Canvas
      camera={{ position: [0, 0, 2.7], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <Scene points={shown} highlight={highlight} theme={theme} />
    </Canvas>
  );
}

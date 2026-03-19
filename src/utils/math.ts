import * as THREE from 'three';

/**
 * Simple hash function: string → deterministic float in [0, 1)
 */
export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  // Convert to positive float 0-1
  return ((hash & 0x7fffffff) % 10000) / 10000;
}

/**
 * Returns a seeded sequence of deterministic random floats from a seed string.
 * Call next() for each value needed.
 */
export function seededSequence(seed: string) {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = ((state << 5) - state + seed.charCodeAt(i)) | 0;
  }
  return {
    next(): number {
      state = (state * 1664525 + 1013904223) | 0;
      return ((state >>> 0) % 10000) / 10000;
    },
  };
}

/**
 * Returns a point on a unit sphere using a seeded random sequence.
 */
export function sphericalRandom(rng: { next(): number }): THREE.Vector3 {
  const theta = rng.next() * Math.PI * 2;
  const phi = Math.acos(2 * rng.next() - 1);
  const r = Math.cbrt(rng.next()); // cube root for volume-uniform distribution
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
  );
}

/**
 * Cubic Bezier for cross-shard transaction arcs.
 * Control points pull toward the metachain origin with a slight vertical arc.
 */
export function crossShardBezier(
  start: THREE.Vector3,
  end: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): void {
  // Control points: pulled toward origin (metachain), arced upward dramatically
  // The arc height scales with the distance between source and destination
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const arcHeight = dist * 0.35; // 35% of distance as arc height

  const p1x = start.x * 0.4; // pull 60% toward origin
  const p1y = start.y + arcHeight;
  const p1z = start.z * 0.4;

  const p2x = end.x * 0.4;
  const p2y = end.y + arcHeight;
  const p2z = end.z * 0.4;

  const omt = 1 - t;
  const omt2 = omt * omt;
  const omt3 = omt2 * omt;
  const t2 = t * t;
  const t3 = t2 * t;

  out.x = omt3 * start.x + 3 * omt2 * t * p1x + 3 * omt * t2 * p2x + t3 * end.x;
  out.y = omt3 * start.y + 3 * omt2 * t * p1y + 3 * omt * t2 * p2y + t3 * end.y;
  out.z = omt3 * start.z + 3 * omt2 * t * p1z + 3 * omt * t2 * p2z + t3 * end.z;
}

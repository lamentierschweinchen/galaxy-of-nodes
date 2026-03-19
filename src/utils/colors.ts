import * as THREE from 'three';

// Base shard colors — amber / teal / coral
export const SHARD_BASE_COLORS: Record<number, THREE.Color> = {
  0: new THREE.Color(0xe8a849), // warm amber/gold
  1: new THREE.Color(0x4ecdc4), // cool teal
  2: new THREE.Color(0xe06c75), // deep coral
  4294967295: new THREE.Color(0xffffff), // metachain white
};

const HOT_WHITE = new THREE.Color(1.0, 0.98, 0.95);

/**
 * Returns a shard-colored THREE.Color with ±30° hue variation.
 * Uses a deterministic seed so the same validator always gets the same color.
 * High ratings shift the color toward white-hot.
 */
export function shardColorWithVariation(
  shardId: number,
  seed: number,
  rating: number = 50,
): THREE.Color {
  const base = SHARD_BASE_COLORS[shardId] ?? SHARD_BASE_COLORS[0];
  const color = base.clone();

  // Convert to HSL, vary hue by ±30° (±0.083 in 0-1 range)
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);

  const hueVariation = (seed - 0.5) * 0.167; // ±0.083
  hsl.h = ((hsl.h + hueVariation) % 1 + 1) % 1;

  // Slight saturation variation
  hsl.s = Math.max(0.3, Math.min(1.0, hsl.s + (seed - 0.5) * 0.2));

  color.setHSL(hsl.h, hsl.s, hsl.l);

  // High-rating validators shift toward white-hot
  if (rating > 70) {
    const whiteMix = ((rating - 70) / 30) * 0.4; // up to 40% white mix
    color.lerp(HOT_WHITE, whiteMix);
  }

  return color;
}

/**
 * Map validator rating (0-100) to brightness (0.2 - 1.0)
 */
export function ratingToBrightness(rating: number): number {
  return 0.2 + (rating / 100) * 0.8;
}

/**
 * Map stake to point size (2.0 - 8.0) using log scale
 */
export function stakeToSize(
  stakeStr: string,
  minStake: number,
  maxStake: number,
): number {
  const stake = parseFloat(stakeStr) / 1e18;
  const logMin = Math.log(minStake + 1);
  const logMax = Math.log(maxStake + 1);
  const logStake = Math.log(stake + 1);
  const norm = (logStake - logMin) / (logMax - logMin + 0.001);
  return 2.0 + Math.max(0, Math.min(1, norm)) * 6.0;
}

// Stellar temperature palette for background stars
// 60% white-blue, 20% warm yellow, 10% orange, 10% deep blue
const STAR_TEMPERATURE_COLORS = [
  { color: new THREE.Color(0.65, 0.75, 1.0), weight: 10 },  // hot blue-white
  { color: new THREE.Color(0.95, 0.95, 1.0), weight: 25 },  // white
  { color: new THREE.Color(0.80, 0.85, 1.0), weight: 25 },  // blue-white
  { color: new THREE.Color(1.0, 0.95, 0.85), weight: 15 },  // yellow-white
  { color: new THREE.Color(1.0, 0.88, 0.65), weight: 10 },  // warm yellow
  { color: new THREE.Color(1.0, 0.72, 0.45), weight: 8 },   // orange
  { color: new THREE.Color(1.0, 0.55, 0.35), weight: 5 },   // cool red
  { color: new THREE.Color(0.45, 0.55, 1.0), weight: 2 },   // deep blue
];

// Pre-built weighted palette for O(1) random sampling
const TEMPERATURE_PALETTE: THREE.Color[] = [];
for (const entry of STAR_TEMPERATURE_COLORS) {
  for (let i = 0; i < entry.weight; i++) {
    TEMPERATURE_PALETTE.push(entry.color);
  }
}

/** Pick a random star color from temperature distribution */
export function randomStarColor(): THREE.Color {
  return TEMPERATURE_PALETTE[
    Math.floor(Math.random() * TEMPERATURE_PALETTE.length)
  ].clone();
}

/** Power-law size distribution — many tiny, few bright */
export function powerLawSize(baseSize: number, variation: number): number {
  const u = Math.random();
  const powerLaw = Math.pow(u, 3.0);
  return baseSize * 0.3 + powerLaw * variation * 2.5;
}

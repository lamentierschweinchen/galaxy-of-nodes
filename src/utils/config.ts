import * as THREE from 'three';

// Shard attractor positions — equilateral triangle on XZ plane, radius 50 from origin
const R = 50;
export const SHARD_POSITIONS: Record<number, THREE.Vector3> = {
  0: new THREE.Vector3(R, 0, 0),
  1: new THREE.Vector3(R * Math.cos((2 * Math.PI) / 3), 0, R * Math.sin((2 * Math.PI) / 3)),
  2: new THREE.Vector3(R * Math.cos((4 * Math.PI) / 3), 0, R * Math.sin((4 * Math.PI) / 3)),
  4294967295: new THREE.Vector3(0, 0, 0), // metachain at origin
};

export const METACHAIN_SHARD_ID = 4294967295;

export const VALIDATOR_CLUSTER_RADIUS = 15;
export const BACKGROUND_STAR_COUNT = 80_000;
export const DUST_PARTICLE_COUNT = 3_000;
export const MOCK_VALIDATOR_COUNT = 3_221;
export const VALIDATORS_PER_SHARD = 720;

// Camera
export const CAMERA_ORBIT_RADIUS = 100;
export const CAMERA_ORBIT_SPEED = 0.03; // rad/s, full orbit ≈ 3.5 min
export const CAMERA_MIN_DISTANCE = 15;
export const CAMERA_MAX_DISTANCE = 200;
export const CAMERA_INACTIVITY_RESUME_MS = 15_000;

// Supernova block time: 600ms rounds
export const BLOCK_TIME_MS = 600;

// API — poll every 2s (catches ~3 blocks per poll at 600ms rounds)
export const API_BASE = 'https://api.battleofnodes.com';
export const EXPLORER_BASE = 'https://bon-explorer.multiversx.com';
export const POLL_INTERVAL_MS = 2_000;
export const API_VALIDATOR_FETCH_SIZE = 10_000;
export const API_BLOCK_FETCH_SIZE = 10;
export const API_TX_FETCH_SIZE = 50;
export const MAX_POLL_BACKOFF_MS = 30_000;

// Bloom
export const BLOOM_STRENGTH = 0.8;
export const BLOOM_RADIUS = 0.5;
export const BLOOM_THRESHOLD = 0.35;

// Background
export const BG_COLOR = new THREE.Color(0x050510);
export const BG_STAR_SHELL_INNER = 200;
export const BG_STAR_SHELL_OUTER = 500;

// Shard breathing frequencies (Hz) — each shard breathes at a slightly different rate
export const SHARD_BREATH_FREQUENCIES: Record<number, number> = {
  0: 0.3,
  1: 0.35,
  2: 0.4,
  4294967295: 0.25,
};

// Cluster rotation speed (rad/s)
export const CLUSTER_ROTATION_SPEED = 0.02;

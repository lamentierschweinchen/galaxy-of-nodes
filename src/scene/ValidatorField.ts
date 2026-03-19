import * as THREE from 'three';
import { starVertexShader, starFragmentShader } from '../shaders/star';
import { shardColorWithVariation, ratingToBrightness, stakeToSize } from '../utils/colors';
import { seededSequence, sphericalRandom } from '../utils/math';
import {
  MOCK_VALIDATOR_COUNT,
  VALIDATORS_PER_SHARD,
  VALIDATOR_CLUSTER_RADIUS,
  METACHAIN_SHARD_ID,
} from '../utils/config';
import { ShardCluster } from './ShardCluster';

export interface ValidatorData {
  bls: string;
  shard: number;
  rating: number;
  stake: string;
  online: boolean;
}

/**
 * Renders all validator stars as a single Points geometry with custom shaders.
 * Each validator is a star with size (stake), brightness (rating), color (shard + variation).
 */
export class ValidatorField {
  readonly points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private brightnesses: Float32Array;
  private phases: Float32Array;
  private proposerPulses: Float32Array;
  private baseBrightnesses: Float32Array;

  // Original positions relative to cluster center (for rotation)
  private localOffsets: Float32Array;
  // Which shard each validator belongs to (for rotation grouping)
  private shardIds: Uint32Array;

  // BLS key → vertex index for O(1) lookup
  private blsToIndex: Map<string, number> = new Map();

  private count: number;

  constructor(clusters: ShardCluster[]) {
    this.count = MOCK_VALIDATOR_COUNT;

    this.positions = new Float32Array(this.count * 3);
    this.localOffsets = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.brightnesses = new Float32Array(this.count);
    this.baseBrightnesses = new Float32Array(this.count);
    this.phases = new Float32Array(this.count);
    this.proposerPulses = new Float32Array(this.count);
    this.shardIds = new Uint32Array(this.count);

    // Generate mock validators
    const mockValidators = this.generateMockData();
    this.populateAttributes(mockValidators, clusters);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aBrightness', new THREE.BufferAttribute(this.brightnesses, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phases, 1));
    this.geometry.setAttribute(
      'aProposerPulse',
      new THREE.BufferAttribute(this.proposerPulses, 1),
    );

    this.material = new THREE.ShaderMaterial({
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSizeMultiplier: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  private generateMockData(): ValidatorData[] {
    const validators: ValidatorData[] = [];
    // Metachain has fewer validators (400), shards have ~933 each
    const shardCounts: [number, number][] = [
      [0, 933],
      [1, 933],
      [2, 934],
      [METACHAIN_SHARD_ID, 400],
    ];

    for (const [shardId, count] of shardCounts) {
      for (let i = 0; i < count; i++) {
        const bls = `mock_shard${shardId}_validator${i}_${Math.random().toString(36).slice(2, 10)}`;
        validators.push({
          bls,
          shard: shardId,
          rating: 40 + Math.random() * 60, // 40-100
          stake: (2500 + Math.random() * 7500).toFixed(0) + '000000000000000000', // 2500-10000 EGLD
          online: Math.random() > 0.05,
        });
      }
    }
    return validators;
  }

  private populateAttributes(
    validators: ValidatorData[],
    clusters: ShardCluster[],
  ): void {
    const clusterMap = new Map<number, ShardCluster>();
    for (const c of clusters) clusterMap.set(c.shardId, c);

    for (let i = 0; i < validators.length && i < this.count; i++) {
      const v = validators[i];
      const i3 = i * 3;
      const cluster = clusterMap.get(v.shard);
      const center = cluster?.center ?? new THREE.Vector3();

      // Deterministic position within cluster
      // Metachain validators spread wider to avoid stacking on the orb
      const rng = seededSequence(v.bls);
      const clusterRadius =
        v.shard === METACHAIN_SHARD_ID
          ? VALIDATOR_CLUSTER_RADIUS * 0.6  // smaller count feels denser at smaller radius
          : VALIDATOR_CLUSTER_RADIUS;
      const minRadius = v.shard === METACHAIN_SHARD_ID ? 0.4 : 0.3;
      const offset = sphericalRandom(rng).multiplyScalar(
        clusterRadius * (minRadius + rng.next() * (1.0 - minRadius)),
      );

      // Store local offset for rotation
      this.localOffsets[i3] = offset.x;
      this.localOffsets[i3 + 1] = offset.y;
      this.localOffsets[i3 + 2] = offset.z;

      // World position = cluster center + offset
      this.positions[i3] = center.x + offset.x;
      this.positions[i3 + 1] = center.y + offset.y;
      this.positions[i3 + 2] = center.z + offset.z;

      // Shard ID for rotation grouping
      this.shardIds[i] = v.shard;

      // Color: shard base with ±30° hue variation, high ratings shift white-hot
      const seed = rng.next();
      const color = shardColorWithVariation(v.shard, seed, v.rating);
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      // Size from stake — higher stake = bigger star
      this.sizes[i] = stakeToSize(v.stake, 2500, 100000);

      // Brightness from rating (scaled slightly — bloom adds glow)
      this.brightnesses[i] = ratingToBrightness(v.rating) * 0.8;

      // Store base brightness for breathing modulation
      this.baseBrightnesses[i] = this.brightnesses[i];

      // Random phase for twinkle
      this.phases[i] = rng.next();

      // No proposer pulse initially
      this.proposerPulses[i] = 0;

      // Index for lookup
      this.blsToIndex.set(v.bls, i);
    }
  }

  /** Set real validators (Phase 3) */
  setValidators(validators: ValidatorData[], clusters: ShardCluster[]): void {
    this.count = Math.min(validators.length, this.positions.length / 3);
    this.blsToIndex.clear();
    this.populateAttributes(validators, clusters);
    this.markAllDirty();
    this.geometry.setDrawRange(0, this.count);
  }

  /** Trigger proposer pulse on a validator */
  pulseProposer(bls: string): void {
    const idx = this.blsToIndex.get(bls);
    if (idx !== undefined) {
      this.proposerPulses[idx] = 1.0;
      (this.geometry.getAttribute('aProposerPulse') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** Get world position of a validator by BLS key */
  getPositionForBls(bls: string): THREE.Vector3 | null {
    const idx = this.blsToIndex.get(bls);
    if (idx === undefined) return null;
    const i3 = idx * 3;
    return new THREE.Vector3(
      this.positions[i3],
      this.positions[i3 + 1],
      this.positions[i3 + 2],
    );
  }

  update(dt: number, clusters: ShardCluster[]): void {
    this.material.uniforms.uTime.value += dt;

    // Apply slow per-shard rotation
    const clusterMap = new Map<number, ShardCluster>();
    for (const c of clusters) clusterMap.set(c.shardId, c);

    let positionsDirty = false;
    let pulsesDirty = false;
    let brightnessDirty = false;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const shardId = this.shardIds[i];
      const cluster = clusterMap.get(shardId);

      if (cluster) {
        // Rotate local offset around Y axis by cluster rotation angle
        const angle = cluster.rotation;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const lx = this.localOffsets[i3];
        const lz = this.localOffsets[i3 + 2];

        this.positions[i3] = cluster.center.x + lx * cos - lz * sin;
        this.positions[i3 + 1] = cluster.center.y + this.localOffsets[i3 + 1];
        this.positions[i3 + 2] = cluster.center.z + lx * sin + lz * cos;
        positionsDirty = true;

        // Apply per-shard breathing to brightness
        this.brightnesses[i] = this.baseBrightnesses[i] * cluster.breathIntensity;
        brightnessDirty = true;
      }

      // Decay proposer pulse
      if (this.proposerPulses[i] > 0.001) {
        this.proposerPulses[i] *= Math.exp(-dt * 3.0);
        if (this.proposerPulses[i] < 0.001) this.proposerPulses[i] = 0;
        pulsesDirty = true;
      }
    }

    if (positionsDirty) {
      (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    if (pulsesDirty) {
      (this.geometry.getAttribute('aProposerPulse') as THREE.BufferAttribute).needsUpdate = true;
    }
    if (brightnessDirty) {
      (this.geometry.getAttribute('aBrightness') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  private markAllDirty(): void {
    const attrs = ['position', 'aColor', 'aSize', 'aBrightness', 'aPhase', 'aProposerPulse'];
    for (const name of attrs) {
      (this.geometry.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

import * as THREE from 'three';
import {
  SHARD_POSITIONS,
  CLUSTER_ROTATION_SPEED,
  SHARD_BREATH_FREQUENCIES,
} from '../utils/config';
import { SHARD_BASE_COLORS } from '../utils/colors';

/**
 * Data class representing a single shard cluster.
 * Holds shard center position, color, rotation state, and breathing phase.
 */
export class ShardCluster {
  readonly shardId: number;
  readonly center: THREE.Vector3;
  readonly baseColor: THREE.Color;
  readonly breathFrequency: number;

  rotation: number = 0;
  breathPhase: number = 0;

  constructor(shardId: number) {
    this.shardId = shardId;
    this.center = (SHARD_POSITIONS[shardId] ?? new THREE.Vector3()).clone();
    this.baseColor = (SHARD_BASE_COLORS[shardId] ?? new THREE.Color(0xffffff)).clone();
    this.breathFrequency = SHARD_BREATH_FREQUENCIES[shardId] ?? 0.3;

    // Offset breath phase by shard ID so clusters don't breathe in sync
    this.breathPhase = (shardId % 4) * 1.5;
  }

  update(dt: number): void {
    this.rotation += CLUSTER_ROTATION_SPEED * dt;
    this.breathPhase += this.breathFrequency * Math.PI * 2 * dt;
  }

  /** Current breathing intensity: 0.9 - 1.1 */
  get breathIntensity(): number {
    return 0.95 + 0.05 * Math.sin(this.breathPhase);
  }
}

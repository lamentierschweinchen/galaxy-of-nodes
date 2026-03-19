import * as THREE from 'three';
import { particleVertexShader, particleFragmentShader } from '../shaders/particle';
import { crossShardBezier } from '../utils/math';

const MAX_PARTICLES = 800;

// Transaction type → color mapping (saturated to stand out from starfield)
const TX_COLORS: Record<string, THREE.Color> = {
  transfer: new THREE.Color(1.0, 0.85, 0.5),       // warm gold
  scCall: new THREE.Color(0.3, 0.9, 1.0),           // bright cyan
  esdtTransfer: new THREE.Color(0.9, 0.5, 1.0),     // vivid purple
  crossShard: new THREE.Color(1.0, 0.95, 0.7),      // bright warm white
};

interface TxParticle {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  age: number;
  lifetime: number;
  brightness: number;
  color: THREE.Color;
  size: number;
  isCrossShard: boolean;
  active: boolean;
}

/**
 * Object pool for transaction particles rendered as Points.
 * Pre-allocates 500 particle slots. Uses setDrawRange to only render active particles.
 */
export class TransactionPool {
  readonly points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private particles: TxParticle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private brightnesses: Float32Array;
  private lives: Float32Array;

  private activeCount = 0;
  private tmpVec = new THREE.Vector3();

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    this.brightnesses = new Float32Array(MAX_PARTICLES);
    this.lives = new Float32Array(MAX_PARTICLES);

    // Pre-allocate particle slots
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        age: 0,
        lifetime: 1,
        brightness: 0,
        color: new THREE.Color(),
        size: 0,
        isCrossShard: false,
        active: false,
      });
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aBrightness', new THREE.BufferAttribute(this.brightnesses, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /**
   * Spawn a transaction particle.
   * @param start World position of sender
   * @param end World position of receiver
   * @param isCrossShard Whether this is a cross-shard transaction
   * @param type Transaction type (transfer, scCall, esdtTransfer)
   * @param valueBrightness 0-1 brightness based on transaction value
   */
  spawn(
    start: THREE.Vector3,
    end: THREE.Vector3,
    isCrossShard: boolean,
    type: string,
    valueBrightness: number,
  ): void {
    // Find an inactive slot
    let slot = -1;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].active) {
        slot = i;
        break;
      }
    }

    // If no slot, recycle the oldest
    if (slot === -1) {
      let oldestAge = 0;
      slot = 0;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const remaining = this.particles[i].lifetime - this.particles[i].age;
        if (remaining < oldestAge || i === 0) {
          oldestAge = remaining;
          slot = i;
        }
      }
    }

    const p = this.particles[slot];
    p.startPos.copy(start);
    p.endPos.copy(end);
    p.age = 0;
    p.lifetime = isCrossShard ? 2.0 : 0.6;
    p.isCrossShard = isCrossShard;
    p.active = true;

    // Color based on type (cross-shard overrides to white)
    if (isCrossShard) {
      p.color.copy(TX_COLORS.crossShard);
    } else {
      p.color.copy(TX_COLORS[type] ?? TX_COLORS.transfer);
    }

    // Size: cross-shard larger, high-value larger
    const baseSize = isCrossShard ? 4.5 : 3.0;
    p.size = baseSize + valueBrightness * 3.5;

    // Brightness — tx particles should be noticeably bright
    p.brightness = 0.7 + valueBrightness * 0.3;
  }

  /**
   * Spawn a "comet" trail for cross-shard — multiple staggered particles along the path.
   */
  spawnComet(
    start: THREE.Vector3,
    end: THREE.Vector3,
    type: string,
    valueBrightness: number,
  ): void {
    // Main particle
    this.spawn(start, end, true, type, valueBrightness);

    // 2-3 trailing particles with slight delay (achieved by pre-aging them negatively)
    for (let trail = 0; trail < 2; trail++) {
      const slot = this.findInactiveSlot();
      if (slot === -1) break;

      const p = this.particles[slot];
      p.startPos.copy(start);
      p.endPos.copy(end);
      p.age = -(trail + 1) * 0.15; // negative age = delayed start
      p.lifetime = 2.0;
      p.isCrossShard = true;
      p.active = true;
      p.color.copy(TX_COLORS.crossShard);
      p.size = 2.0 - trail * 0.5; // trailing particles are smaller
      p.brightness = (0.5 + valueBrightness * 0.5) * (0.7 - trail * 0.2); // dimmer
    }
  }

  private findInactiveSlot(): number {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.particles[i].active) return i;
    }
    return -1;
  }

  update(dt: number): void {
    this.activeCount = 0;

    // Stable indices: each particle writes to its own slot (no compaction).
    // Inactive particles are hidden by setting size=0.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      const i3 = i * 3;

      if (!p.active) {
        // Hide inactive particles
        this.sizes[i] = 0;
        continue;
      }

      p.age += dt;

      // Handle delayed particles (negative age)
      if (p.age < 0) {
        this.sizes[i] = 0;
        continue;
      }

      if (p.age >= p.lifetime) {
        p.active = false;
        this.sizes[i] = 0;
        continue;
      }

      this.activeCount++;
      const t = p.age / p.lifetime; // 0 → 1
      const life = 1.0 - t;

      // Compute position along path
      if (p.isCrossShard) {
        crossShardBezier(p.startPos, p.endPos, t, this.tmpVec);
      } else {
        this.tmpVec.lerpVectors(p.startPos, p.endPos, t);
      }

      this.positions[i3] = this.tmpVec.x;
      this.positions[i3 + 1] = this.tmpVec.y;
      this.positions[i3 + 2] = this.tmpVec.z;

      this.colors[i3] = p.color.r;
      this.colors[i3 + 1] = p.color.g;
      this.colors[i3 + 2] = p.color.b;

      this.sizes[i] = p.size;
      this.brightnesses[i] = p.brightness;
      this.lives[i] = life;
    }

    // Update GPU buffers — draw all slots, inactive hidden by size=0
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aBrightness') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, MAX_PARTICLES);
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

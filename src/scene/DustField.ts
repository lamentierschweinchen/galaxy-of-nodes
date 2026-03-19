import * as THREE from 'three';
import { bgStarVertexShader, bgStarFragmentShader } from '../shaders/bgStar';
import { DUST_PARTICLE_COUNT, SHARD_POSITIONS } from '../utils/config';
import { SHARD_BASE_COLORS } from '../utils/colors';

/**
 * Ambient dust particles drifting slowly through the inter-cluster void.
 * Very small, very dim, muted shard colors. Creates "alive" feeling.
 */
export class DustField {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private positions: Float32Array;
  private velocities: Float32Array;
  private count: number;
  private boundRadius = 60;

  constructor() {
    this.count = DUST_PARTICLE_COUNT;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);

    const colors = new Float32Array(this.count * 3);
    const sizes = new Float32Array(this.count);
    const brightnesses = new Float32Array(this.count);
    const phases = new Float32Array(this.count);

    // Shard centers and colors for nearest-color lookup
    const shardEntries = Object.entries(SHARD_POSITIONS)
      .filter(([id]) => Number(id) !== 4294967295)
      .map(([id, pos]) => ({
        pos,
        color: SHARD_BASE_COLORS[Number(id)] ?? new THREE.Color(0x888888),
      }));

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;

      // Random position within bounding sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.random() * this.boundRadius;

      this.positions[i3] = r * Math.sin(phi) * Math.cos(theta);
      this.positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.positions[i3 + 2] = r * Math.cos(phi);

      // Very slow drift velocity
      const speed = 0.05 + Math.random() * 0.15;
      const vTheta = Math.random() * Math.PI * 2;
      const vPhi = Math.acos(2 * Math.random() - 1);
      this.velocities[i3] = speed * Math.sin(vPhi) * Math.cos(vTheta);
      this.velocities[i3 + 1] = speed * Math.sin(vPhi) * Math.sin(vTheta);
      this.velocities[i3 + 2] = speed * Math.cos(vPhi);

      // Color: muted version of nearest shard color (30% saturation)
      const pos = new THREE.Vector3(
        this.positions[i3],
        this.positions[i3 + 1],
        this.positions[i3 + 2],
      );
      let nearestColor = new THREE.Color(0x888888);
      let minDist = Infinity;
      for (const entry of shardEntries) {
        const d = pos.distanceTo(entry.pos);
        if (d < minDist) {
          minDist = d;
          nearestColor = entry.color;
        }
      }
      const hsl = { h: 0, s: 0, l: 0 };
      nearestColor.getHSL(hsl);
      const dustColor = new THREE.Color().setHSL(hsl.h, hsl.s * 0.3, hsl.l * 0.5);
      colors[i3] = dustColor.r;
      colors[i3 + 1] = dustColor.g;
      colors[i3 + 2] = dustColor.b;

      // Small but visible
      sizes[i] = 0.5 + Math.random() * 1.0;
      brightnesses[i] = 0.08 + Math.random() * 0.15;
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightnesses, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: bgStarVertexShader,
      fragmentShader: bgStarFragmentShader,
      uniforms: {
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  update(dt: number): void {
    this.material.uniforms.uTime.value += dt;

    // Drift particles
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // Wrap: teleport to opposite side if beyond bounding sphere
      const x = this.positions[i3];
      const y = this.positions[i3 + 1];
      const z = this.positions[i3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      if (dist > this.boundRadius) {
        this.positions[i3] = -x * 0.8;
        this.positions[i3 + 1] = -y * 0.8;
        this.positions[i3 + 2] = -z * 0.8;
      }
    }

    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

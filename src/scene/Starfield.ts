import * as THREE from 'three';
import { bgStarVertexShader, bgStarFragmentShader } from '../shaders/bgStar';
import { randomStarColor, powerLawSize } from '../utils/colors';
import {
  BACKGROUND_STAR_COUNT,
  BG_STAR_SHELL_INNER,
  BG_STAR_SHELL_OUTER,
} from '../utils/config';

/**
 * 80,000 ambient background stars on a large sphere shell.
 * Static geometry — only uTime uniform updates for twinkle.
 * Uses Fibonacci spiral for even distribution.
 */
export class Starfield {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;

  constructor() {
    const count = BACKGROUND_STAR_COUNT;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    // Golden angle for Fibonacci spiral
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Fibonacci sphere distribution
      const y = 1 - (2 * (i + 0.5)) / count; // -1 to 1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;

      // Random radius within shell
      const r =
        BG_STAR_SHELL_INNER +
        Math.random() * (BG_STAR_SHELL_OUTER - BG_STAR_SHELL_INNER);

      positions[i3] = radiusAtY * Math.cos(theta) * r;
      positions[i3 + 1] = y * r;
      positions[i3 + 2] = radiusAtY * Math.sin(theta) * r;

      // Temperature-based color
      const color = randomStarColor();
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Power-law size: many tiny, few bright
      sizes[i] = powerLawSize(1.0, 2.0);

      // Brightness correlates loosely with size
      const sizeNorm = sizes[i] / 5.0;
      brightnesses[i] = 0.35 + sizeNorm * 0.5 + Math.random() * 0.25;

      // Random phase for twinkle
      phases[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
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
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

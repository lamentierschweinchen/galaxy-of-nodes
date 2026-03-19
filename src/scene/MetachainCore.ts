import * as THREE from 'three';
import { metachainVertexShader, metachainFragmentShader } from '../shaders/metachain';

/**
 * Central glowing orb representing the metachain.
 * Fresnel rim glow with animated surface noise and ambient pulsing.
 */
export class MetachainCore {
  readonly mesh: THREE.Mesh;
  readonly light: THREE.PointLight;
  private material: THREE.ShaderMaterial;
  private time: number = 0;

  constructor() {
    const geometry = new THREE.SphereGeometry(3, 32, 32);

    this.material = new THREE.ShaderMaterial({
      vertexShader: metachainVertexShader,
      fragmentShader: metachainFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(0, 0, 0);

    // Subtle point light for illuminating nearby validators
    this.light = new THREE.PointLight(0xffffff, 0.15, 40, 2);
    this.light.position.set(0, 0, 0);
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;

    // Ambient pulse: sine wave
    const pulse = 0.3 + 0.3 * Math.sin(this.time * 2.0);
    this.material.uniforms.uPulse.value = pulse;

    // Scale oscillation
    const scale = 1.0 + 0.03 * Math.sin(this.time * 2.0);
    this.mesh.scale.setScalar(scale);

    // Light intensity follows pulse
    this.light.intensity = 0.1 + pulse * 0.1;
  }

  /** Trigger a strong pulse (e.g., on new metachain block) */
  triggerPulse(): void {
    this.material.uniforms.uPulse.value = 1.0;
    this.mesh.scale.setScalar(1.15);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

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
  private pulseBoost: number = 0; // decays from 1.0 on triggerPulse

  constructor() {
    const geometry = new THREE.SphereGeometry(4.5, 32, 32);

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
    this.light = new THREE.PointLight(0xffffff, 0.25, 60, 2);
    this.light.position.set(0, 0, 0);
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;

    // Decay pulse boost
    if (this.pulseBoost > 0.001) {
      this.pulseBoost *= Math.exp(-dt * 4.0); // ~0.25s visible decay for 600ms blocks
    } else {
      this.pulseBoost = 0;
    }

    // Ambient pulse + triggered pulse overlay
    const basePulse = 0.3 + 0.3 * Math.sin(this.time * 2.0);
    const totalPulse = basePulse + this.pulseBoost * 0.7;
    this.material.uniforms.uPulse.value = Math.min(totalPulse, 1.0);

    // Scale: ambient oscillation + pulse boost
    const scale = 1.0 + 0.03 * Math.sin(this.time * 2.0) + this.pulseBoost * 0.12;
    this.mesh.scale.setScalar(scale);

    // Light intensity follows combined pulse
    this.light.intensity = 0.1 + totalPulse * 0.15;
  }

  /** Trigger a strong pulse (e.g., on new metachain block) */
  triggerPulse(): void {
    this.pulseBoost = 1.0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

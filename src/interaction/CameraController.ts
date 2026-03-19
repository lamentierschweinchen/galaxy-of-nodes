import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CAMERA_ORBIT_RADIUS,
  CAMERA_ORBIT_SPEED,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_INACTIVITY_RESUME_MS,
} from '../utils/config';

/**
 * Camera controller with auto-orbit and user override.
 * Auto-orbits slowly around the galaxy. Stops on user interaction,
 * resumes after 15 seconds of inactivity.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private autoOrbit = true;
  private orbitAngle = 0;
  private inactivityTimer: number | null = null;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    this.camera = camera;

    // Initial position: overview of all clusters
    camera.position.set(CAMERA_ORBIT_RADIUS, 25, 0);
    camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = CAMERA_MIN_DISTANCE;
    this.controls.maxDistance = CAMERA_MAX_DISTANCE;
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;

    // Stop auto-orbit on user interaction
    this.controls.addEventListener('start', () => {
      this.autoOrbit = false;
      this.resetInactivityTimer();
    });
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = window.setTimeout(() => {
      this.autoOrbit = true;
      // Sync orbit angle to current camera position
      this.orbitAngle = Math.atan2(this.camera.position.z, this.camera.position.x);
    }, CAMERA_INACTIVITY_RESUME_MS);
  }

  /** Smoothly zoom camera toward a world position (click-to-zoom) */
  zoomTo(target: THREE.Vector3): void {
    this.autoOrbit = false;
    this.resetInactivityTimer();

    // Animate controls target and camera position toward the target
    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, target)
      .normalize();
    const zoomDistance = 30;
    const newCamPos = target.clone().add(direction.multiplyScalar(zoomDistance));

    // Simple smooth transition using lerp over multiple frames
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let progress = 0;

    const animate = () => {
      progress += 0.03;
      if (progress > 1) progress = 1;
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic

      this.camera.position.lerpVectors(startPos, newCamPos, ease);
      this.controls.target.lerpVectors(startTarget, target, ease);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }

  update(dt: number): void {
    if (this.autoOrbit) {
      this.orbitAngle += CAMERA_ORBIT_SPEED * dt;
      const r = CAMERA_ORBIT_RADIUS;
      this.camera.position.x = Math.cos(this.orbitAngle) * r;
      this.camera.position.z = Math.sin(this.orbitAngle) * r;
      // Gentle vertical oscillation
      this.camera.position.y = 20 + Math.sin(this.orbitAngle * 0.3) * 10;
    }

    this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
    if (this.inactivityTimer !== null) {
      clearTimeout(this.inactivityTimer);
    }
  }
}

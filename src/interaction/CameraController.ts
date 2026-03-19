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

  // Zoom animation state (integrated into update loop)
  private zoomProgress = -1;
  private zoomStartPos = new THREE.Vector3();
  private zoomEndPos = new THREE.Vector3();
  private zoomStartTarget = new THREE.Vector3();
  private zoomEndTarget = new THREE.Vector3();
  private zoomDuration = 1.2; // seconds

  /** Smoothly zoom camera toward a world position (click-to-zoom) */
  zoomTo(target: THREE.Vector3): void {
    this.autoOrbit = false;
    this.resetInactivityTimer();

    const direction = new THREE.Vector3()
      .subVectors(this.camera.position, target)
      .normalize();
    const zoomDistance = 30;

    this.zoomStartPos.copy(this.camera.position);
    this.zoomEndPos.copy(target).add(direction.multiplyScalar(zoomDistance));
    this.zoomStartTarget.copy(this.controls.target);
    this.zoomEndTarget.copy(target);
    this.zoomProgress = 0;
  }

  update(dt: number): void {
    // Zoom animation (runs within the main loop, framerate-independent)
    if (this.zoomProgress >= 0 && this.zoomProgress < 1) {
      this.zoomProgress += dt / this.zoomDuration;
      if (this.zoomProgress > 1) this.zoomProgress = 1;
      const ease = 1 - Math.pow(1 - this.zoomProgress, 3); // ease-out cubic

      this.camera.position.lerpVectors(this.zoomStartPos, this.zoomEndPos, ease);
      this.controls.target.lerpVectors(this.zoomStartTarget, this.zoomEndTarget, ease);
    } else if (this.autoOrbit) {
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

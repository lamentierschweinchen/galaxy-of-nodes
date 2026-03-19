import * as THREE from 'three';
import { ValidatorField } from '../scene/ValidatorField';
import { MockDataGenerator, MockValidator } from '../data/MockData';
import { Tooltip } from './Tooltip';

/**
 * Raycaster for hover/touch detection on validator stars.
 * Shows tooltip on hover (desktop) or tap (mobile), click/tap-to-zoom.
 */
export class ValidatorRaycaster {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.PerspectiveCamera;
  private validatorField: ValidatorField;
  private mockData: MockDataGenerator;
  private tooltip: Tooltip;
  private canvas: HTMLCanvasElement;

  private hoveredIndex: number | null = null;
  private onClickCallback?: (validator: MockValidator) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    validatorField: ValidatorField,
    mockData: MockDataGenerator,
  ) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points!.threshold = 1.5;
    this.mouse = new THREE.Vector2(-999, -999);
    this.camera = camera;
    this.canvas = canvas;
    this.validatorField = validatorField;
    this.mockData = mockData;
    this.tooltip = new Tooltip();

    // Desktop
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('mouseleave', this.onMouseLeave);

    // Mobile touch
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  private updateMouse(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycast(): number | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.validatorField.points);
    return intersects.length > 0 ? intersects[0].index! : null;
  }

  private onMouseMove = (event: MouseEvent): void => {
    this.updateMouse(event.clientX, event.clientY);
    const index = this.raycast();

    if (index !== null) {
      this.hoveredIndex = index;
      const validator = this.mockData.getValidator(index);
      if (validator) {
        this.tooltip.show(event.clientX, event.clientY, validator);
        this.canvas.style.cursor = 'pointer';
      }
    } else {
      this.hoveredIndex = null;
      this.tooltip.hide();
      this.canvas.style.cursor = 'default';
    }
  };

  private onClick = (_event: MouseEvent): void => {
    if (this.hoveredIndex !== null) {
      const validator = this.mockData.getValidator(this.hoveredIndex);
      if (validator) {
        this.onClickCallback?.(validator);
      }
    }
  };

  private onMouseLeave = (): void => {
    this.hoveredIndex = null;
    this.tooltip.hide();
    this.canvas.style.cursor = 'default';
  };

  // --- Touch support ---
  private touchStartPos: { x: number; y: number } | null = null;

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
  };

  private onTouchEnd = (event: TouchEvent): void => {
    if (!this.touchStartPos || event.changedTouches.length === 0) return;
    const touch = event.changedTouches[0];

    // Only treat as tap if finger didn't move much (not a drag/pinch)
    const dx = touch.clientX - this.touchStartPos.x;
    const dy = touch.clientY - this.touchStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 20) {
      this.touchStartPos = null;
      return;
    }

    this.updateMouse(touch.clientX, touch.clientY);
    const index = this.raycast();

    if (index !== null) {
      const validator = this.mockData.getValidator(index);
      if (validator) {
        // Show tooltip briefly, then zoom
        this.tooltip.show(touch.clientX, touch.clientY, validator);
        this.onClickCallback?.(validator);
        // Hide tooltip after 2s on mobile
        setTimeout(() => this.tooltip.hide(), 2000);
      }
    } else {
      this.tooltip.hide();
    }

    this.touchStartPos = null;
  };

  onValidatorClick(callback: (validator: MockValidator) => void): void {
    this.onClickCallback = callback;
  }

  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.tooltip.dispose();
  }
}

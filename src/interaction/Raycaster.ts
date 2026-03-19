import * as THREE from 'three';
import { ValidatorField } from '../scene/ValidatorField';
import { MockDataGenerator, MockValidator } from '../data/MockData';
import { Tooltip } from './Tooltip';

/**
 * Raycaster for hover detection on validator stars.
 * Shows tooltip on hover, click-to-zoom on click.
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

    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  private onMouseMove = (event: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.validatorField.points);

    if (intersects.length > 0) {
      const index = intersects[0].index!;
      if (index !== this.hoveredIndex) {
        this.hoveredIndex = index;
        const validator = this.mockData.getValidator(index);
        if (validator) {
          this.tooltip.show(event.clientX, event.clientY, validator);
          this.canvas.style.cursor = 'pointer';
        }
      } else {
        // Update tooltip position on same validator
        const validator = this.mockData.getValidator(index);
        if (validator) {
          this.tooltip.show(event.clientX, event.clientY, validator);
        }
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

  onValidatorClick(callback: (validator: MockValidator) => void): void {
    this.onClickCallback = callback;
  }

  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.tooltip.dispose();
  }
}

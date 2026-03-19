import * as THREE from 'three';
import { ValidatorField } from '../scene/ValidatorField';
import type { ValidatorInfo } from '../data/DataSource';
import { Tooltip } from './Tooltip';

interface ValidatorLookup {
  getValidator(index: number): ValidatorInfo | undefined;
}

/**
 * Raycaster for hover detection on validator stars.
 * Shows tooltip on hover, click-to-zoom on click.
 */
export class ValidatorRaycaster {
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.PerspectiveCamera;
  private validatorField: ValidatorField;
  private dataProvider: ValidatorLookup;
  private tooltip: Tooltip;
  private canvas: HTMLCanvasElement;

  private hoveredIndex: number | null = null;
  private onClickCallback?: (validator: ValidatorInfo) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
    validatorField: ValidatorField,
    dataProvider: ValidatorLookup,
  ) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points!.threshold = 1.5;
    this.mouse = new THREE.Vector2(-999, -999);
    this.camera = camera;
    this.canvas = canvas;
    this.validatorField = validatorField;
    this.dataProvider = dataProvider;
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
        const validator = this.dataProvider.getValidator(index);
        if (validator) {
          this.tooltip.show(event.clientX, event.clientY, validator);
          this.canvas.style.cursor = 'pointer';
        }
      } else {
        // Update tooltip position on same validator
        const validator = this.dataProvider.getValidator(index);
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
      const validator = this.dataProvider.getValidator(this.hoveredIndex);
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

  onValidatorClick(callback: (validator: ValidatorInfo) => void): void {
    this.onClickCallback = callback;
  }

  setDataProvider(dataProvider: ValidatorLookup): void {
    this.dataProvider = dataProvider;
  }

  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.tooltip.dispose();
  }
}

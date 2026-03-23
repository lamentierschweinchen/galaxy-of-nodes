import type { ValidatorInfo } from '../data/DataSource';

/**
 * Floating tooltip that follows mouse position.
 * Shows validator info on hover. Pure CSS, no framework.
 */
export class Tooltip {
  private el: HTMLElement;
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: 20;
      padding: 10px 14px;
      background: rgba(5, 5, 16, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      backdrop-filter: blur(8px);
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
      line-height: 1.6;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.15s ease;
      max-width: 280px;
    `;
    document.body.appendChild(this.el);
  }

  show(x: number, y: number, validator: ValidatorInfo): void {
    const stakeEgld = (parseFloat(validator.stake) / 1e18).toFixed(0);
    const ratingColor =
      validator.rating >= 95 ? '#4ecdc4' :
      validator.rating >= 80 ? '#e8a849' :
      '#e06c75';

    this.el.innerHTML = `
      <div style="color: rgba(255,255,255,0.95); font-size: 13px; margin-bottom: 4px; font-weight: 500;">${validator.name}</div>
      <div style="color: rgba(255,255,255,0.4); font-size: 10px; margin-bottom: 6px;">${validator.provider}</div>
      <div>Shard <span style="color: rgba(255,255,255,0.95);">${validator.shard === 4294967295 ? 'Meta' : validator.shard}</span></div>
      <div>Rating <span style="color: ${ratingColor};">${validator.rating.toFixed(1)}</span></div>
      <div>Stake <span style="color: rgba(255,255,255,0.95);">${Number(stakeEgld).toLocaleString()} EGLD</span></div>
      <div>Status <span style="color: ${validator.online ? '#4ecdc4' : '#e06c75'};">${validator.online ? 'Online' : 'Offline'}</span></div>
      <div style="margin-top: 4px; color: rgba(255,255,255,0.3); font-size: 9px;">${validator.bls.slice(0, 16)}...</div>
    `;

    // Position: offset from cursor, keep on screen
    const pad = 16;
    let left = x + pad;
    let top = y + pad;
    if (left + 280 > window.innerWidth) left = x - 280 - pad;
    if (top + 200 > window.innerHeight) top = y - 200 - pad;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.opacity = '1';
    this.visible = true;
  }

  hide(): void {
    if (this.visible) {
      this.el.style.opacity = '0';
      this.visible = false;
    }
  }

  dispose(): void {
    this.el.remove();
  }
}

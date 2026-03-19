/**
 * Minimal HUD overlay — CSS DOM elements positioned over the WebGL canvas.
 * No dashboard aesthetics. Semi-transparent, monospace, minimal.
 */
export class HUD {
  private container: HTMLElement;
  private roundEl: HTMLElement;
  private epochEl: HTMLElement;
  private validatorsEl: HTMLElement;
  private tpsBarEl: HTMLElement;
  private tpsBarFill: HTMLElement;
  private activeParticlesEl: HTMLElement;

  constructor() {
    this.container = document.getElementById('hud')!;
    this.container.innerHTML = '';

    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .hud-text {
        font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        user-select: none;
      }
      .hud-value {
        color: rgba(255, 255, 255, 0.85);
        font-size: 14px;
        font-weight: 500;
      }
      .hud-top-left {
        position: absolute;
        top: 24px;
        left: 28px;
      }
      .hud-top-right {
        position: absolute;
        top: 24px;
        right: 28px;
        text-align: right;
      }
      .hud-bottom-center {
        position: absolute;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }
      .tps-bar-container {
        width: 200px;
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
      }
      .tps-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, rgba(232, 168, 73, 0.6), rgba(78, 205, 196, 0.6), rgba(224, 108, 117, 0.6));
        border-radius: 2px;
        transition: width 0.5s ease-out;
        width: 0%;
      }
      .hud-row {
        display: flex;
        gap: 6px;
        align-items: baseline;
        margin-bottom: 4px;
      }
    `;
    this.container.appendChild(style);

    // Top-left: Block round + epoch
    const topLeft = document.createElement('div');
    topLeft.className = 'hud-top-left hud-text';
    topLeft.innerHTML = `
      <div class="hud-row">
        <span>Round</span>
        <span class="hud-value" id="hud-round">0</span>
      </div>
      <div class="hud-row">
        <span>Epoch</span>
        <span class="hud-value" id="hud-epoch">0</span>
      </div>
    `;
    this.container.appendChild(topLeft);

    // Top-right: Validators online
    const topRight = document.createElement('div');
    topRight.className = 'hud-top-right hud-text';
    topRight.innerHTML = `
      <div class="hud-row" style="justify-content: flex-end;">
        <span class="hud-value" id="hud-validators">0</span>
        <span>validators</span>
      </div>
      <div class="hud-row" style="justify-content: flex-end;">
        <span class="hud-value" id="hud-particles">0</span>
        <span>active tx</span>
      </div>
    `;
    this.container.appendChild(topRight);

    // Bottom-center: TPS energy bar
    const bottomCenter = document.createElement('div');
    bottomCenter.className = 'hud-bottom-center hud-text';
    bottomCenter.innerHTML = `
      <div class="tps-bar-container">
        <div class="tps-bar-fill" id="hud-tps-fill"></div>
      </div>
      <span id="hud-tps-label" style="font-size: 10px; opacity: 0.5;">0 tx/s</span>
    `;
    this.container.appendChild(bottomCenter);

    // Cache elements
    this.roundEl = document.getElementById('hud-round')!;
    this.epochEl = document.getElementById('hud-epoch')!;
    this.validatorsEl = document.getElementById('hud-validators')!;
    this.tpsBarFill = document.getElementById('hud-tps-fill')!;
    this.activeParticlesEl = document.getElementById('hud-particles')!;
    this.tpsBarEl = bottomCenter;
  }

  updateStats(stats: {
    round: number;
    epoch: number;
    tps: number;
    onlineCount: number;
    activeParticles: number;
  }): void {
    this.roundEl.textContent = stats.round.toLocaleString();
    this.epochEl.textContent = stats.epoch.toLocaleString();
    this.validatorsEl.textContent = stats.onlineCount.toLocaleString();
    this.activeParticlesEl.textContent = stats.activeParticles.toString();

    // TPS bar: map 0-10000 TPS to 0-100% width
    const tpsPercent = Math.min(100, (stats.tps / 10000) * 100);
    this.tpsBarFill.style.width = `${tpsPercent}%`;

    // TPS label with formatted number
    const tpsLabel = document.getElementById('hud-tps-label');
    if (tpsLabel) {
      const formatted = stats.tps >= 1000
        ? `${(stats.tps / 1000).toFixed(1)}k tx/s`
        : `${Math.round(stats.tps)} tx/s`;
      tpsLabel.textContent = formatted;
    }
  }
}

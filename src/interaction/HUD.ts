import type { NetworkId } from '../utils/config';

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
  private networkSelect: HTMLSelectElement;
  private refreshIntervalInput: HTMLInputElement;

  private networkChangeCallback?: (network: NetworkId) => void;
  private refreshIntervalChangeCallback?: (intervalMs: number) => void;

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
        pointer-events: auto;
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
      .hud-controls {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .hud-control-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hud-control-input {
        font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.85);
        background: rgba(5, 5, 16, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 4px;
        outline: none;
        padding: 2px 6px;
        min-height: 22px;
        pointer-events: auto;
      }
      .hud-control-input:focus {
        border-color: rgba(255, 255, 255, 0.4);
      }
      .hud-control-select {
        width: 190px;
      }
      .hud-control-number {
        width: 70px;
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
      <div class="hud-controls">
        <div class="hud-control-row">
          <span style="font-size:10px;opacity:0.55;">Network</span>
          <select class="hud-control-input hud-control-select" id="hud-network-select">
            <option value="mainnet">Mainnet</option>
            <option value="battle-of-nodes">Battle of Nodes</option>
            <option value="devnet">Devnet</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>
        <div class="hud-control-row">
          <span style="font-size:10px;opacity:0.55;">Refresh (s)</span>
          <input class="hud-control-input hud-control-number" id="hud-refresh-input" type="number" min="1" max="6" step="1" value="6" />
        </div>
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
        <span class="hud-value" id="hud-total-tx">0</span>
        <span>transactions</span>
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
      <span id="hud-tps-label" style="font-size: 10px; opacity: 0.5;">Network Activity</span>
    `;
    this.container.appendChild(bottomCenter);

    // Cache elements
    this.roundEl = document.getElementById('hud-round')!;
    this.epochEl = document.getElementById('hud-epoch')!;
    this.validatorsEl = document.getElementById('hud-validators')!;
    this.tpsBarFill = document.getElementById('hud-tps-fill')!;
    this.activeParticlesEl = document.getElementById('hud-total-tx')!;
    this.tpsBarEl = bottomCenter;

    this.networkSelect = document.getElementById('hud-network-select') as HTMLSelectElement;
    this.refreshIntervalInput = document.getElementById('hud-refresh-input') as HTMLInputElement;

    this.networkSelect.addEventListener('change', () => {
      this.networkChangeCallback?.(this.networkSelect.value as NetworkId);
    });

    this.refreshIntervalInput.addEventListener('change', () => {
      const seconds = Number(this.refreshIntervalInput.value);
      if (!Number.isFinite(seconds) || seconds < 1) {
        this.refreshIntervalInput.value = '6';
        this.refreshIntervalChangeCallback?.(6_000);
        return;
      }

      const normalized = Math.max(1, Math.min(6, Math.round(seconds)));
      this.refreshIntervalInput.value = String(normalized);
      this.refreshIntervalChangeCallback?.(normalized * 1000);
    });

    this.refreshIntervalInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      this.refreshIntervalInput.dispatchEvent(new Event('change'));
    });
  }

  onNetworkChange(callback: (network: NetworkId) => void): void {
    this.networkChangeCallback = callback;
  }

  onRefreshIntervalChange(callback: (intervalMs: number) => void): void {
    this.refreshIntervalChangeCallback = callback;
  }

  setNetwork(network: NetworkId): void {
    this.networkSelect.value = network;
  }

  setRefreshIntervalMs(intervalMs: number): void {
    this.refreshIntervalInput.value = String(Math.max(1, Math.min(6, Math.round(intervalMs / 1000))));
  }

  updateStats(stats: {
    round: number;
    epoch: number;
    tps: number;
    onlineCount: number;
    totalTransactions: number;
  }): void {
    this.roundEl.textContent = stats.round.toLocaleString();
    this.epochEl.textContent = stats.epoch.toLocaleString();
    this.validatorsEl.textContent = stats.onlineCount.toLocaleString();

    // Format total transactions with K/M suffixes
    const total = stats.totalTransactions;
    if (total >= 1_000_000) {
      this.activeParticlesEl.textContent = `${(total / 1_000_000).toFixed(1)}M`;
    } else if (total >= 1000) {
      this.activeParticlesEl.textContent = `${(total / 1000).toFixed(1)}K`;
    } else {
      this.activeParticlesEl.textContent = total.toLocaleString();
    }

    // TPS bar: map 0-10000 TPS to 0-100% width
    const tpsPercent = Math.min(100, (stats.tps / 10000) * 100);
    this.tpsBarFill.style.width = `${tpsPercent}%`;

    // TPS label
    const tpsLabel = document.getElementById('hud-tps-label');
    if (tpsLabel) {
      if (stats.tps > 0) {
        const formatted = stats.tps >= 1000
          ? `${(stats.tps / 1000).toFixed(1)}K TPS`
          : `${Math.round(stats.tps)} TPS`;
        tpsLabel.textContent = formatted;
      } else {
        tpsLabel.textContent = 'Network Activity';
      }
    }
  }
}

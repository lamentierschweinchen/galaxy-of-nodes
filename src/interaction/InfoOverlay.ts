import * as THREE from 'three';
import type { TransactionData } from '../data/DataSource';
import { SHARD_POSITIONS, METACHAIN_SHARD_ID } from '../utils/config';
import { SHARD_BASE_COLORS } from '../utils/colors';

/**
 * Info overlay — toggled via an "i" button.
 * When active, shows:
 * - Shard labels floating near each cluster (projected 3D → 2D)
 * - Node counts per shard
 * - Sampled transaction feed on the right side
 */
export class InfoOverlay {
  private container: HTMLElement;
  private toggleBtn: HTMLElement;
  private overlay: HTMLElement;
  private shardLabels: Map<number, HTMLElement> = new Map();
  private txFeed: HTMLElement;
  private txFeedList: HTMLElement;
  private active = false;
  private camera: THREE.PerspectiveCamera;

  // Shard stats
  private shardCounts: Map<number, number> = new Map();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.container = document.getElementById('hud')!;

    // Toggle button — "i" info icon, top-center
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.innerHTML = 'i';
    this.toggleBtn.style.cssText = `
      position: absolute;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 25;
      width: 32px;
      height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      background: rgba(5, 5, 16, 0.5);
      backdrop-filter: blur(8px);
      cursor: pointer;
      font-family: 'Georgia', serif;
      font-style: italic;
      font-size: 16px;
      color: rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      pointer-events: auto;
      padding: 0;
      line-height: 1;
    `;
    this.toggleBtn.addEventListener('mouseenter', () => {
      this.toggleBtn.style.borderColor = 'rgba(255, 255, 255, 0.5)';
      this.toggleBtn.style.color = 'rgba(255, 255, 255, 0.8)';
    });
    this.toggleBtn.addEventListener('mouseleave', () => {
      if (!this.active) {
        this.toggleBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        this.toggleBtn.style.color = 'rgba(255, 255, 255, 0.5)';
      }
    });
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.container.appendChild(this.toggleBtn);

    // Overlay container (hidden by default)
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.4s ease;
    `;
    this.container.appendChild(this.overlay);

    // Create shard labels
    const shardNames: Record<number, string> = {
      0: 'SHARD 0',
      1: 'SHARD 1',
      2: 'SHARD 2',
      [METACHAIN_SHARD_ID]: 'METACHAIN',
    };

    for (const [idStr, name] of Object.entries(shardNames)) {
      const id = Number(idStr);
      const label = document.createElement('div');
      const color = SHARD_BASE_COLORS[id];
      const hex = '#' + color.getHexString();

      label.style.cssText = `
        position: absolute;
        pointer-events: none;
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 10px;
        letter-spacing: 2px;
        text-transform: uppercase;
        color: ${hex};
        opacity: 0.7;
        text-shadow: 0 0 8px ${hex}40;
        white-space: nowrap;
        transform: translate(-50%, -50%);
        transition: opacity 0.3s ease;
      `;
      label.innerHTML = `<div style="text-align:center;">${name}<br><span id="shard-count-${id}" style="font-size:9px;opacity:0.5;letter-spacing:1px;">0 nodes</span></div>`;
      this.overlay.appendChild(label);
      this.shardLabels.set(id, label);
    }

    // Transaction feed — right side
    this.txFeed = document.createElement('div');
    this.txFeed.style.cssText = `
      position: absolute;
      right: 28px;
      top: 50%;
      transform: translateY(-50%);
      width: 240px;
      max-height: 400px;
      overflow: hidden;
      pointer-events: none;
    `;

    const feedHeader = document.createElement('div');
    feedHeader.style.cssText = `
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 9px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.3);
      margin-bottom: 8px;
      text-align: right;
    `;
    feedHeader.textContent = 'RECENT TRANSACTIONS';
    this.txFeed.appendChild(feedHeader);

    this.txFeedList = document.createElement('div');
    this.txFeedList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 3px;
    `;
    this.txFeed.appendChild(this.txFeedList);
    this.overlay.appendChild(this.txFeed);
  }

  private toggle(): void {
    this.active = !this.active;
    this.overlay.style.opacity = this.active ? '1' : '0';
    this.toggleBtn.style.borderColor = this.active
      ? 'rgba(255, 255, 255, 0.6)'
      : 'rgba(255, 255, 255, 0.2)';
    this.toggleBtn.style.color = this.active
      ? 'rgba(255, 255, 255, 0.9)'
      : 'rgba(255, 255, 255, 0.5)';
    this.toggleBtn.style.background = this.active
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(5, 5, 16, 0.5)';
  }

  setShardCounts(counts: Map<number, number>): void {
    this.shardCounts = counts;
    for (const [id, count] of counts) {
      const el = document.getElementById(`shard-count-${id}`);
      if (el) el.textContent = `${count} nodes`;
    }
  }

  private lastFeedUpdate = 0;
  private feedUpdateInterval = 1.5; // update feed every 1.5s (not every frame)

  updateTransactionFeed(txs: TransactionData[], dt: number): void {
    if (!this.active || txs.length === 0) return;

    this.lastFeedUpdate += dt;
    if (this.lastFeedUpdate < this.feedUpdateInterval) return;
    this.lastFeedUpdate = 0;

    const toShow = txs.slice(0, 10);

    this.txFeedList.innerHTML = '';

    for (let idx = 0; idx < toShow.length; idx++) {
      const tx = toShow[idx];
      const isCross = tx.senderShard !== tx.receiverShard;

      // Human-readable function name
      const funcName = this.humanReadableTxType(tx);

      // Shard routing
      const shardFrom = tx.senderShard === METACHAIN_SHARD_ID ? 'Meta' : `Shard ${tx.senderShard}`;
      const shardTo = tx.receiverShard === METACHAIN_SHARD_ID ? 'Meta' : `Shard ${tx.receiverShard}`;
      const routing = isCross
        ? `${shardFrom} → ${shardTo}`
        : shardFrom;

      // Color by type
      const typeColor = tx.type === 'scCall' ? '#4ecdc4'
        : tx.type === 'esdtTransfer' ? '#c4a0ff'
          : 'rgba(255,255,255,0.6)';

      const row = document.createElement('div');
      row.style.cssText = `
        font-family: 'SF Mono', 'Fira Code', monospace;
        font-size: 10px;
        color: rgba(255, 255, 255, 0.4);
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        padding: 3px 0;
        opacity: 0;
        animation: txFadeIn 0.3s ease forwards;
        animation-delay: ${idx * 0.05}s;
        border-bottom: 1px solid rgba(255,255,255,0.03);
      `;

      row.innerHTML = `
        <span style="color:${typeColor};">${funcName}</span>
        <span style="color:rgba(255,255,255,0.25);font-size:9px;">${routing}</span>
      `;

      this.txFeedList.appendChild(row);
    }
  }

  private humanReadableTxType(tx: TransactionData): string {
    if (tx.function) {
      // Capitalize and space-separate camelCase
      const name = tx.function
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      return name;
    }
    switch (tx.type) {
      case 'transfer': return 'Move Balance';
      case 'esdtTransfer': return 'ESDT Transfer';
      case 'scCall': return 'SC Call';
      default: return 'Transfer';
    }
  }

  /** Project 3D shard positions to 2D screen coordinates */
  updateLabelPositions(): void {
    if (!this.active) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const [id, label] of this.shardLabels) {
      const pos3d = SHARD_POSITIONS[id];
      if (!pos3d) continue;

      // Offset label above the cluster
      const projected = pos3d.clone();
      projected.y += 20;
      projected.project(this.camera);

      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;

      // Only show if in front of camera
      if (projected.z < 1) {
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.style.display = 'block';
      } else {
        label.style.display = 'none';
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    this.toggleBtn.remove();
    this.overlay.remove();
  }
}

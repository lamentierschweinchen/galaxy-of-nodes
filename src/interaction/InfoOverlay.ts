import * as THREE from 'three';
import type { TransactionData } from '../data/DataSource';
import { SHARD_POSITIONS, METACHAIN_SHARD_ID, EXPLORER_BASE } from '../utils/config';
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
    this.toggleBtn.setAttribute('aria-label', 'Toggle network info overlay');
    this.toggleBtn.setAttribute('title', 'Network info');
    this.toggleBtn.addEventListener('focus', () => {
      this.toggleBtn.style.outline = '1px solid rgba(255, 255, 255, 0.5)';
      this.toggleBtn.style.outlineOffset = '2px';
    });
    this.toggleBtn.addEventListener('blur', () => {
      this.toggleBtn.style.outline = 'none';
    });
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

    // Legend — standalone hover/tap button, independent of info overlay
    this.createLegendButton();
  }

  private legendOpen = false;
  private legendBtn!: HTMLElement;
  private legendPanel!: HTMLElement;

  private createLegendButton(): void {
    // Wrapper — always visible, bottom-left
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 28px;
      z-index: 20;
      pointer-events: auto;
    `;

    // Button — tiny galaxy icon (3 colored dots orbiting a bright center)
    this.legendBtn = document.createElement('button');
    this.legendBtn.setAttribute('aria-label', 'What am I looking at?');
    this.legendBtn.setAttribute('title', 'Legend');
    this.legendBtn.style.cssText = `
      width: 36px;
      height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      background: rgba(5, 5, 16, 0.6);
      backdrop-filter: blur(8px);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.2s ease, background 0.2s ease;
      padding: 0;
      position: relative;
    `;

    // SVG galaxy icon: bright center + 3 colored orbit dots
    this.legendBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" fill="white" opacity="0.7"/>
        <circle cx="9" cy="9" r="4.5" stroke="white" stroke-width="0.3" opacity="0.15"/>
        <circle cx="4.5" cy="7" r="1.3" fill="#e8a849" opacity="0.8"/>
        <circle cx="13" cy="7" r="1.3" fill="#4ecdc4" opacity="0.8"/>
        <circle cx="9" cy="14" r="1.3" fill="#e06c75" opacity="0.8"/>
      </svg>
    `;

    // Hover effects
    this.legendBtn.addEventListener('mouseenter', () => {
      this.legendBtn.style.borderColor = 'rgba(255, 255, 255, 0.35)';
      this.legendBtn.style.background = 'rgba(5, 5, 16, 0.8)';
      if (!this.legendOpen) this.showLegend();
    });
    this.legendBtn.addEventListener('mouseleave', () => {
      if (!this.legendOpen) {
        this.legendBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        this.legendBtn.style.background = 'rgba(5, 5, 16, 0.6)';
      }
    });
    // Click toggles on mobile (and as fallback on desktop)
    this.legendBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.legendOpen) this.hideLegend();
      else this.showLegend();
    });
    // Focus a11y
    this.legendBtn.addEventListener('focus', () => {
      this.legendBtn.style.outline = '1px solid rgba(255, 255, 255, 0.5)';
      this.legendBtn.style.outlineOffset = '2px';
    });
    this.legendBtn.addEventListener('blur', () => {
      this.legendBtn.style.outline = 'none';
    });

    wrapper.appendChild(this.legendBtn);

    // Panel — the actual legend content, appears above the button
    this.legendPanel = document.createElement('div');
    this.legendPanel.style.cssText = `
      position: absolute;
      bottom: 44px;
      left: 0;
      width: 210px;
      padding: 12px 14px;
      background: rgba(5, 5, 16, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      backdrop-filter: blur(12px);
      font-family: 'SF Mono', 'Fira Code', monospace;
      line-height: 1.7;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
    `;

    const shard0 = '#e8a849';
    const shard1 = '#4ecdc4';
    const shard2 = '#e06c75';

    this.legendPanel.innerHTML = `
      <div style="font-size:10px; color:rgba(255,255,255,0.45);">
        <div style="margin-bottom:6px;">
          <span style="color:rgba(255,255,255,0.6);">&#9679;</span> Stars = validator nodes<br>
          <span style="margin-left:12px; font-size:9px; color:rgba(255,255,255,0.28);">bright = high rating &middot; large = high stake</span>
        </div>
        <div style="margin-bottom:6px;">
          <span style="color:rgba(255,255,255,0.6);">&#9679;</span> Particles = transactions<br>
          <span style="margin-left:12px; font-size:9px; color:rgba(255,255,255,0.28);">&#9473; intra-shard &nbsp;&nbsp;&#9476;&#9476; cross-shard</span>
        </div>
        <div style="margin-bottom:8px;">
          <span style="color:rgba(255,255,255,0.75);">&#9673;</span> Center = metachain core
        </div>
        <div style="font-size:9px; color:rgba(255,255,255,0.28); display:flex; gap:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px;">
          <span><span style="color:${shard0};">&#9679;</span> Shard 0</span>
          <span><span style="color:${shard1};">&#9679;</span> Shard 1</span>
          <span><span style="color:${shard2};">&#9679;</span> Shard 2</span>
        </div>
      </div>
    `;

    wrapper.appendChild(this.legendPanel);

    // Close panel when hovering away from the whole wrapper (desktop)
    wrapper.addEventListener('mouseleave', () => {
      this.hideLegend();
    });

    // Close on outside click (mobile)
    document.addEventListener('click', (e) => {
      if (this.legendOpen && !wrapper.contains(e.target as Node)) {
        this.hideLegend();
      }
    });

    this.container.appendChild(wrapper);
  }

  private showLegend(): void {
    this.legendOpen = true;
    this.legendPanel.style.opacity = '1';
    this.legendPanel.style.transform = 'translateY(0)';
    this.legendPanel.style.pointerEvents = 'auto';
    this.legendBtn.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    this.legendBtn.style.background = 'rgba(5, 5, 16, 0.85)';
  }

  private hideLegend(): void {
    this.legendOpen = false;
    this.legendPanel.style.opacity = '0';
    this.legendPanel.style.transform = 'translateY(6px)';
    this.legendPanel.style.pointerEvents = 'none';
    this.legendBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    this.legendBtn.style.background = 'rgba(5, 5, 16, 0.6)';
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

      const hasHash = tx.txHash && tx.txHash.length > 8;
      const row = document.createElement(hasHash ? 'a' : 'div') as HTMLElement;
      if (hasHash) {
        (row as HTMLAnchorElement).href = `${EXPLORER_BASE}/transactions/${tx.txHash}`;
        (row as HTMLAnchorElement).target = '_blank';
        (row as HTMLAnchorElement).rel = 'noopener noreferrer';
      }
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
        text-decoration: none;
        pointer-events: ${hasHash ? 'auto' : 'none'};
        cursor: ${hasHash ? 'pointer' : 'default'};
        transition: opacity 0.15s ease;
      `;
      if (hasHash) {
        row.addEventListener('mouseenter', () => { row.style.opacity = '1'; });
        row.addEventListener('mouseleave', () => { row.style.opacity = ''; });
      }

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

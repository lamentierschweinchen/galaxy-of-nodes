import * as THREE from 'three';
import { MockDataGenerator, MockBlock, MockTransaction } from './MockData';
import { TransactionPool } from '../particles/TransactionPool';
import { ValidatorField } from '../scene/ValidatorField';
import { MetachainCore } from '../scene/MetachainCore';
import { METACHAIN_SHARD_ID } from '../utils/config';

/**
 * Drives the mock simulation: generates blocks every 6s per shard,
 * spawns transaction particles, triggers proposer pulses,
 * and fires supernova bursts every 30s.
 */
export class SimulationEngine {
  private mockData: MockDataGenerator;
  private txPool: TransactionPool;
  private validatorField: ValidatorField;
  private metachainCore: MetachainCore;

  private blockTimer = 0;
  private txTimer = 0;
  private burstTimer = 0;

  // Timing constants
  private blockInterval = 6.0;     // seconds per block round
  private txSpawnInterval = 0.2;   // spawn txs every 200ms
  private burstInterval = 30.0;    // supernova burst every 30s

  // Per-shard block timers (offset so they don't all fire at once)
  private shardBlockTimers: Map<number, number> = new Map();

  // Stats for HUD
  private tpsAccumulator = 0;
  private tpsWindow: number[] = [];
  private currentTps = 0;

  // Callbacks
  onNewBlock?: (block: MockBlock) => void;
  onStatsUpdate?: (stats: { round: number; epoch: number; tps: number; onlineCount: number }) => void;

  constructor(
    mockData: MockDataGenerator,
    txPool: TransactionPool,
    validatorField: ValidatorField,
    metachainCore: MetachainCore,
  ) {
    this.mockData = mockData;
    this.txPool = txPool;
    this.validatorField = validatorField;
    this.metachainCore = metachainCore;

    // Offset shard block timers so they stagger
    this.shardBlockTimers.set(0, 0);
    this.shardBlockTimers.set(1, 1.5);
    this.shardBlockTimers.set(2, 3.0);
    this.shardBlockTimers.set(METACHAIN_SHARD_ID, 4.5);
  }

  update(dt: number): void {
    // --- Block generation (per-shard, staggered) ---
    for (const [shard, timer] of this.shardBlockTimers) {
      const newTimer = timer + dt;
      if (newTimer >= this.blockInterval) {
        this.shardBlockTimers.set(shard, newTimer % this.blockInterval);
        this.produceBlock(shard);
      } else {
        this.shardBlockTimers.set(shard, newTimer);
      }
    }

    // --- Transaction spawning (continuous drip) ---
    this.txTimer += dt;
    if (this.txTimer >= this.txSpawnInterval) {
      this.txTimer -= this.txSpawnInterval;
      this.spawnTransactionBatch(8 + Math.floor(Math.random() * 5)); // 8-12 per tick
    }

    // --- Supernova burst ---
    this.burstTimer += dt;
    if (this.burstTimer >= this.burstInterval) {
      this.burstTimer -= this.burstInterval;
      this.supernovaBurst();
    }

    // --- TPS calculation ---
    this.tpsWindow.push(this.tpsAccumulator);
    this.tpsAccumulator = 0;
    if (this.tpsWindow.length > 30) this.tpsWindow.shift(); // 30-tick rolling window
    const totalTxs = this.tpsWindow.reduce((a, b) => a + b, 0);
    const windowSeconds = this.tpsWindow.length * this.txSpawnInterval;
    this.currentTps = windowSeconds > 0 ? totalTxs / windowSeconds : 0;

    // --- Stats callback ---
    this.onStatsUpdate?.({
      round: this.mockData.getRoundCounter(),
      epoch: this.mockData.getEpoch(),
      tps: this.currentTps,
      onlineCount: this.mockData.getOnlineCount(),
    });
  }

  private produceBlock(shard: number): void {
    const block = this.mockData.generateBlock(shard);

    // Pulse the proposer star
    this.validatorField.pulseProposer(block.proposer);

    // Metachain block triggers core pulse
    if (shard === METACHAIN_SHARD_ID) {
      this.metachainCore.triggerPulse();
    }

    this.onNewBlock?.(block);
  }

  private spawnTransactionBatch(count: number): void {
    const txs = this.mockData.generateTransactions(count);
    this.tpsAccumulator += txs.length;

    for (const tx of txs) {
      this.spawnTxParticle(tx);
    }
  }

  private spawnTxParticle(tx: MockTransaction): void {
    // Get positions from validator field
    const senderPos = this.validatorField.getPositionForBls(tx.sender);
    const receiverPos = this.validatorField.getPositionForBls(tx.receiver);

    if (!senderPos || !receiverPos) {
      // Fallback: use shard center positions
      return;
    }

    const isCrossShard = tx.senderShard !== tx.receiverShard;

    // Value → brightness (log scale)
    const valueEgld = parseFloat(tx.value) / 1e18;
    let valueBrightness = 0.3;
    if (valueEgld > 0) {
      valueBrightness = Math.min(1.0, 0.3 + Math.log10(valueEgld + 1) * 0.15);
    }

    // High-value cross-shard gets comet treatment
    if (isCrossShard && valueBrightness > 0.6) {
      this.txPool.spawnComet(senderPos, receiverPos, tx.type, valueBrightness);
    } else {
      this.txPool.spawn(senderPos, receiverPos, isCrossShard, tx.type, valueBrightness);
    }
  }

  private supernovaBurst(): void {
    const txs = this.mockData.generateSupernovaBurst();
    this.tpsAccumulator += txs.length;

    // Stagger spawning over 0.5s for visual drama
    let delay = 0;
    const batchSize = 20;
    for (let i = 0; i < txs.length; i += batchSize) {
      const batch = txs.slice(i, i + batchSize);
      setTimeout(() => {
        for (const tx of batch) {
          this.spawnTxParticle(tx);
        }
      }, delay);
      delay += 100;
    }

    // Trigger all shard proposer pulses for dramatic effect
    for (const shard of [0, 1, 2, METACHAIN_SHARD_ID]) {
      const v = this.mockData.getRandomValidatorInShard(shard);
      this.validatorField.pulseProposer(v.bls);
    }
    this.metachainCore.triggerPulse();
  }

  getTps(): number {
    return this.currentTps;
  }
}

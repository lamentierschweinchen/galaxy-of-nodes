import { MockDataGenerator, MockBlock, MockTransaction } from './MockData';
import { TransactionPool } from '../particles/TransactionPool';
import { ValidatorField } from '../scene/ValidatorField';
import { MetachainCore } from '../scene/MetachainCore';
import { METACHAIN_SHARD_ID } from '../utils/config';

/**
 * Drives the mock simulation at 1,000-10,000 TPS.
 * Not every transaction becomes a particle — we sample a visual subset.
 * The TPS counter reflects the "real" simulated throughput.
 */
export class SimulationEngine {
  private mockData: MockDataGenerator;
  private txPool: TransactionPool;
  private validatorField: ValidatorField;
  private metachainCore: MetachainCore;

  private blockTimer = 0;
  private txTimer = 0;
  private burstTimer = 0;

  // Timing
  private blockInterval = 6.0;
  private txSpawnInterval = 0.033; // spawn visual particles every ~33ms (30fps)
  private burstInterval = 30.0;

  // Per-shard block timers (staggered)
  private shardBlockTimers: Map<number, number> = new Map();

  // TPS simulation: we simulate high TPS but only visualize a sample
  private simulatedTps = 3000; // baseline TPS (oscillates 1k-10k)
  private tpsPhase = 0;
  private currentTps = 0;
  private txAccumulatedThisSecond = 0;
  private secondTimer = 0;
  private totalTransactions = 0;

  // Burst queue
  private burstQueue: MockTransaction[] = [];
  private burstSpawnTimer = 0;

  // Transaction log for feed display (sampled)
  private recentTransactions: MockTransaction[] = [];
  private maxRecentTxs = 50;

  // Callbacks
  onNewBlock?: (block: MockBlock) => void;

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

    // Stagger shard block timers
    this.shardBlockTimers.set(0, 0);
    this.shardBlockTimers.set(1, 1.5);
    this.shardBlockTimers.set(2, 3.0);
    this.shardBlockTimers.set(METACHAIN_SHARD_ID, 4.5);
  }

  update(dt: number): void {
    // --- Oscillating TPS (1,000 - 10,000, sine wave with noise) ---
    this.tpsPhase += dt * 0.15;
    const baseTps = 3000 + 2000 * Math.sin(this.tpsPhase);
    const noiseTps = baseTps + (Math.random() - 0.5) * 1000;
    this.simulatedTps = Math.max(1000, Math.min(10000, noiseTps));

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

    // --- Visual particle spawning (sampled from simulated TPS) ---
    // At 3000 TPS, we want ~40-60 visual particles per second
    // Scale particle spawn rate with TPS but cap visual density
    this.txTimer += dt;
    if (this.txTimer >= this.txSpawnInterval) {
      this.txTimer -= this.txSpawnInterval;

      // Visual particles: proportional to TPS but capped
      const visualParticlesPerTick = Math.floor(
        2 + (this.simulatedTps / 1000) * 1.5 + Math.random() * 2,
      );
      const txs = this.mockData.generateTransactions(visualParticlesPerTick);

      for (const tx of txs) {
        this.spawnTxParticle(tx);
      }

      // Sample some for the feed
      if (txs.length > 0 && Math.random() < 0.3) {
        this.addToRecentTxs(txs[0]);
      }

      // Count toward simulated TPS (the "real" number)
      const simulatedThisTick = Math.floor(this.simulatedTps * this.txSpawnInterval);
      this.txAccumulatedThisSecond += simulatedThisTick;
    }

    // --- TPS calculation (per-second) ---
    this.secondTimer += dt;
    if (this.secondTimer >= 1.0) {
      this.secondTimer -= 1.0;
      this.currentTps = this.txAccumulatedThisSecond;
      this.totalTransactions += this.txAccumulatedThisSecond;
      this.txAccumulatedThisSecond = 0;
    }

    // --- Supernova burst ---
    this.burstTimer += dt;
    if (this.burstTimer >= this.burstInterval) {
      this.burstTimer -= this.burstInterval;
      this.supernovaBurst();
    }

    // --- Drain burst queue ---
    if (this.burstQueue.length > 0) {
      this.burstSpawnTimer += dt;
      if (this.burstSpawnTimer >= 0.03) {
        this.burstSpawnTimer = 0;
        const batch = this.burstQueue.splice(0, 30);
        for (const tx of batch) {
          this.spawnTxParticle(tx);
        }
      }
    }
  }

  private produceBlock(shard: number): void {
    const block = this.mockData.generateBlock(shard);
    this.validatorField.pulseProposer(block.proposer);

    if (shard === METACHAIN_SHARD_ID) {
      this.metachainCore.triggerPulse();
    }

    this.onNewBlock?.(block);
  }

  private spawnTxParticle(tx: MockTransaction): void {
    const senderPos = this.validatorField.getPositionForBls(tx.sender);
    const receiverPos = this.validatorField.getPositionForBls(tx.receiver);

    if (!senderPos || !receiverPos) return;

    const isCrossShard = tx.senderShard !== tx.receiverShard;

    // Value → brightness
    const valueEgld = parseFloat(tx.value) / 1e18;
    let valueBrightness = 0.3;
    if (valueEgld > 0) {
      valueBrightness = Math.min(1.0, 0.3 + Math.log10(valueEgld + 1) * 0.15);
    }

    // Cross-shard high-value gets comet treatment
    if (isCrossShard && valueBrightness > 0.6) {
      this.txPool.spawnComet(senderPos, receiverPos, tx.type, valueBrightness);
    } else {
      this.txPool.spawn(senderPos, receiverPos, isCrossShard, tx.type, valueBrightness);
    }
  }

  private supernovaBurst(): void {
    // Generate a massive burst
    const txs = this.mockData.generateSupernovaBurst();
    this.burstQueue.push(...txs);
    this.burstSpawnTimer = 0;

    // Trigger all shard proposer pulses
    for (const shard of [0, 1, 2, METACHAIN_SHARD_ID]) {
      const v = this.mockData.getRandomValidatorInShard(shard);
      this.validatorField.pulseProposer(v.bls);
    }
    this.metachainCore.triggerPulse();

    // Spike the TPS counter during burst
    this.txAccumulatedThisSecond += 5000;

    // Add burst txs to feed
    for (let i = 0; i < Math.min(5, txs.length); i++) {
      this.addToRecentTxs(txs[i]);
    }
  }

  private addToRecentTxs(tx: MockTransaction): void {
    this.recentTransactions.unshift(tx);
    if (this.recentTransactions.length > this.maxRecentTxs) {
      this.recentTransactions.length = this.maxRecentTxs;
    }
  }

  getTps(): number {
    return this.currentTps;
  }

  getTotalTransactions(): number {
    return this.totalTransactions;
  }

  getRecentTransactions(): MockTransaction[] {
    return this.recentTransactions;
  }
}

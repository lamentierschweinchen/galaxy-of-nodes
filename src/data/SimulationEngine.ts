import type { DataSource, BlockData, TransactionData } from './DataSource';
import { MockDataGenerator, MockTransaction } from './MockData';
import { TransactionPool } from '../particles/TransactionPool';
import { ValidatorField } from '../scene/ValidatorField';
import { MetachainCore } from '../scene/MetachainCore';
import { METACHAIN_SHARD_ID } from '../utils/config';

/**
 * Drives the visualization in two modes:
 * - Mock mode: generates blocks/txs/TPS locally (existing behavior)
 * - Live mode: receives data from LiveDataSource callbacks, drains tx queues, spawns visuals
 */
export class SimulationEngine {
  private dataSource: DataSource;
  private txPool: TransactionPool;
  private validatorField: ValidatorField;
  private metachainCore: MetachainCore;
  readonly liveMode: boolean;

  // --- Mock-mode timers ---
  private blockTimer = 0;
  private txTimer = 0;
  private burstTimer = 0;
  private blockInterval = 6.0;
  private txSpawnInterval = 0.033;
  private burstInterval = 30.0;
  private shardBlockTimers: Map<number, number> = new Map();

  // --- TPS simulation (mock) ---
  private simulatedTps = 3000;
  private tpsPhase = 0;
  private currentTps = 0;
  private txAccumulatedThisSecond = 0;
  private secondTimer = 0;
  private totalTransactions = 0;

  // --- Mock burst queue ---
  private burstQueue: MockTransaction[] = [];
  private burstSpawnTimer = 0;

  // --- Live-mode state ---
  private liveTxQueue: TransactionData[] = [];
  private liveTxDrainTimer = 0;
  private liveRound = 0;
  private liveEpoch = 0;

  // --- Shared state ---
  private recentTransactions: TransactionData[] = [];
  private maxRecentTxs = 50;

  // Callbacks
  onNewBlock?: (block: BlockData) => void;

  constructor(
    dataSource: DataSource,
    txPool: TransactionPool,
    validatorField: ValidatorField,
    metachainCore: MetachainCore,
    liveMode = false,
  ) {
    this.dataSource = dataSource;
    this.txPool = txPool;
    this.validatorField = validatorField;
    this.metachainCore = metachainCore;
    this.liveMode = liveMode;

    // Stagger shard block timers (mock mode only)
    this.shardBlockTimers.set(0, 0);
    this.shardBlockTimers.set(1, 1.5);
    this.shardBlockTimers.set(2, 3.0);
    this.shardBlockTimers.set(METACHAIN_SHARD_ID, 4.5);
  }

  update(dt: number): void {
    if (this.liveMode) {
      this.updateLive(dt);
    } else {
      this.updateMock(dt);
    }
  }

  // =====================================================================
  // MOCK MODE — existing behavior, untouched
  // =====================================================================

  private updateMock(dt: number): void {
    // Oscillating TPS (1,000 - 10,000)
    this.tpsPhase += dt * 0.15;
    const baseTps = 3000 + 2000 * Math.sin(this.tpsPhase);
    const noiseTps = baseTps + (Math.random() - 0.5) * 1000;
    this.simulatedTps = Math.max(1000, Math.min(10000, noiseTps));

    // Block generation (per-shard, staggered)
    for (const [shard, timer] of this.shardBlockTimers) {
      const newTimer = timer + dt;
      if (newTimer >= this.blockInterval) {
        this.shardBlockTimers.set(shard, newTimer % this.blockInterval);
        this.produceMockBlock(shard);
      } else {
        this.shardBlockTimers.set(shard, newTimer);
      }
    }

    // Visual particle spawning
    this.txTimer += dt;
    if (this.txTimer >= this.txSpawnInterval) {
      this.txTimer -= this.txSpawnInterval;
      const mockData = this.dataSource as MockDataGenerator;
      const visualParticlesPerTick = Math.floor(
        2 + (this.simulatedTps / 1000) * 1.5 + Math.random() * 2,
      );
      const txs = mockData.generateTransactions(visualParticlesPerTick);
      for (const tx of txs) {
        this.spawnMockTxParticle(tx);
      }
      if (txs.length > 0 && Math.random() < 0.3) {
        this.addToRecentTxs(this.mockTxToTransactionData(txs[0]));
      }
      const simulatedThisTick = Math.floor(this.simulatedTps * this.txSpawnInterval);
      this.txAccumulatedThisSecond += simulatedThisTick;
    }

    // TPS calculation (per-second)
    this.secondTimer += dt;
    if (this.secondTimer >= 1.0) {
      this.secondTimer -= 1.0;
      this.currentTps = this.txAccumulatedThisSecond;
      this.totalTransactions += this.txAccumulatedThisSecond;
      this.txAccumulatedThisSecond = 0;
    }

    // Supernova burst
    this.burstTimer += dt;
    if (this.burstTimer >= this.burstInterval) {
      this.burstTimer -= this.burstInterval;
      this.supernovaBurst();
    }

    // Drain burst queue
    if (this.burstQueue.length > 0) {
      this.burstSpawnTimer += dt;
      if (this.burstSpawnTimer >= 0.03) {
        this.burstSpawnTimer = 0;
        const batch = this.burstQueue.splice(0, 30);
        for (const tx of batch) {
          this.spawnMockTxParticle(tx);
        }
      }
    }
  }

  private produceMockBlock(shard: number): void {
    const mockData = this.dataSource as MockDataGenerator;
    const block = mockData.generateBlock(shard);
    this.validatorField.pulseProposer(block.proposer);
    if (shard === METACHAIN_SHARD_ID) {
      this.metachainCore.triggerPulse();
    }
    this.onNewBlock?.(block);
  }

  private spawnMockTxParticle(tx: MockTransaction): void {
    const senderPos = this.validatorField.getPositionForBls(tx.sender);
    const receiverPos = this.validatorField.getPositionForBls(tx.receiver);
    if (!senderPos || !receiverPos) return;

    const isCrossShard = tx.senderShard !== tx.receiverShard;
    const valueEgld = parseFloat(tx.value) / 1e18;
    let valueBrightness = 0.3;
    if (valueEgld > 0) {
      valueBrightness = Math.min(1.0, 0.3 + Math.log10(valueEgld + 1) * 0.15);
    }

    if (isCrossShard && valueBrightness > 0.6) {
      this.txPool.spawnComet(senderPos, receiverPos, tx.type, valueBrightness);
    } else {
      this.txPool.spawn(senderPos, receiverPos, isCrossShard, tx.type, valueBrightness);
    }
  }

  private supernovaBurst(): void {
    const mockData = this.dataSource as MockDataGenerator;
    const txs = mockData.generateSupernovaBurst();
    this.burstQueue.push(...txs);
    this.burstSpawnTimer = 0;

    for (const shard of [0, 1, 2, METACHAIN_SHARD_ID]) {
      const v = mockData.getRandomValidatorInShard(shard);
      this.validatorField.pulseProposer(v.bls);
    }
    this.metachainCore.triggerPulse();
    this.txAccumulatedThisSecond += 5000;

    for (let i = 0; i < Math.min(5, txs.length); i++) {
      this.addToRecentTxs(this.mockTxToTransactionData(txs[i]));
    }
  }

  private mockTxToTransactionData(tx: MockTransaction): TransactionData {
    return {
      txHash: tx.txHash,
      sender: tx.sender,
      receiver: tx.receiver,
      senderShard: tx.senderShard,
      receiverShard: tx.receiverShard,
      value: tx.value,
      status: tx.status,
      function: tx.function,
      type: tx.type,
    };
  }

  // =====================================================================
  // LIVE MODE — receives data from LiveDataSource callbacks
  // =====================================================================

  private updateLive(dt: number): void {
    // Drain live tx queue gradually (spread over poll interval)
    if (this.liveTxQueue.length > 0) {
      this.liveTxDrainTimer += dt;
      // Spread queued txs evenly over ~5 seconds
      const drainInterval = Math.max(0.05, 5.0 / Math.max(1, this.liveTxQueue.length));
      if (this.liveTxDrainTimer >= drainInterval) {
        this.liveTxDrainTimer -= drainInterval;
        const tx = this.liveTxQueue.shift();
        if (tx) this.spawnLiveTxParticle(tx);
      }
    }

    // Spawn synthetic ambient particles proportional to reported TPS
    // (API only gives ~50 txs per poll, but real TPS could be thousands)
    this.txTimer += dt;
    if (this.txTimer >= this.txSpawnInterval && this.currentTps > 10) {
      this.txTimer -= this.txSpawnInterval;
      const count = Math.floor(1 + (this.currentTps / 1000) * 1.5);
      for (let i = 0; i < count; i++) {
        this.spawnSyntheticParticle();
      }
    }

    // TPS smoothing (per-second tick for display)
    this.secondTimer += dt;
    if (this.secondTimer >= 1.0) {
      this.secondTimer -= 1.0;
    }
  }

  /** Called by LiveDataSource when a new block arrives */
  onLiveBlock(block: BlockData): void {
    this.validatorField.pulseProposer(block.proposer);
    if (block.shard === METACHAIN_SHARD_ID) {
      this.metachainCore.triggerPulse();
    }
    this.onNewBlock?.(block);
  }

  /** Called by LiveDataSource when new transactions arrive */
  onLiveTransactions(txs: TransactionData[]): void {
    // Enqueue for gradual visual draining
    this.liveTxQueue.push(...txs);
    // Cap queue to prevent unbounded growth
    if (this.liveTxQueue.length > 200) {
      this.liveTxQueue.splice(0, this.liveTxQueue.length - 200);
    }

    // Diversity-select for feed: round-robin by type
    const byType: Record<string, TransactionData[]> = {};
    for (const tx of txs) {
      const key = tx.type;
      if (!byType[key]) byType[key] = [];
      byType[key].push(tx);
    }
    const diverse: TransactionData[] = [];
    const types = Object.keys(byType);
    let added = true;
    while (added && diverse.length < 8) {
      added = false;
      for (const t of types) {
        if (byType[t].length > 0 && diverse.length < 8) {
          diverse.push(byType[t].shift()!);
          added = true;
        }
      }
    }

    for (const tx of diverse) {
      this.addToRecentTxs(tx);
    }
  }

  /** Called by LiveDataSource when stats update */
  onLiveStats(stats: { tps: number; totalTransactions: number; epoch: number; round: number }): void {
    this.currentTps = stats.tps;
    this.totalTransactions = stats.totalTransactions;
    this.liveEpoch = stats.epoch;
    this.liveRound = stats.round;
  }

  private spawnLiveTxParticle(tx: TransactionData): void {
    // For live data, pick random validators in the sender/receiver shards
    // (addresses don't map to specific validator stars)
    const senderValidator = this.dataSource.getRandomValidatorInShard(tx.senderShard);
    const receiverValidator = this.dataSource.getRandomValidatorInShard(tx.receiverShard);

    const senderPos = this.validatorField.getPositionForBls(senderValidator.bls);
    const receiverPos = this.validatorField.getPositionForBls(receiverValidator.bls);
    if (!senderPos || !receiverPos) return;

    const isCrossShard = tx.senderShard !== tx.receiverShard;
    const valueEgld = parseFloat(tx.value) / 1e18;
    let valueBrightness = 0.3;
    if (valueEgld > 0) {
      valueBrightness = Math.min(1.0, 0.3 + Math.log10(valueEgld + 1) * 0.15);
    }

    if (isCrossShard && valueBrightness > 0.6) {
      this.txPool.spawnComet(senderPos, receiverPos, tx.type, valueBrightness);
    } else {
      this.txPool.spawn(senderPos, receiverPos, isCrossShard, tx.type, valueBrightness);
    }
  }

  private spawnSyntheticParticle(): void {
    const shards = [0, 1, 2];
    const senderShard = shards[Math.floor(Math.random() * 3)];
    const isCrossShard = Math.random() < 0.3;
    const receiverShard = isCrossShard
      ? shards.filter(s => s !== senderShard)[Math.floor(Math.random() * 2)]
      : senderShard;

    const sender = this.dataSource.getRandomValidatorInShard(senderShard);
    const receiver = this.dataSource.getRandomValidatorInShard(receiverShard);

    const senderPos = this.validatorField.getPositionForBls(sender.bls);
    const receiverPos = this.validatorField.getPositionForBls(receiver.bls);
    if (!senderPos || !receiverPos) return;

    const brightness = 0.2 + Math.random() * 0.3;
    const types: Array<'transfer' | 'scCall' | 'esdtTransfer'> = ['transfer', 'scCall', 'esdtTransfer'];
    const type = types[Math.floor(Math.random() * 3)];

    this.txPool.spawn(senderPos, receiverPos, isCrossShard, type, brightness);
  }

  // =====================================================================
  // Shared getters
  // =====================================================================

  private addToRecentTxs(tx: TransactionData): void {
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

  getRound(): number {
    if (this.liveMode) return this.liveRound;
    const mockData = this.dataSource as MockDataGenerator;
    return mockData.getRoundCounter();
  }

  getEpoch(): number {
    if (this.liveMode) return this.liveEpoch;
    const mockData = this.dataSource as MockDataGenerator;
    return mockData.getEpoch();
  }

  getRecentTransactions(): TransactionData[] {
    return this.recentTransactions;
  }
}

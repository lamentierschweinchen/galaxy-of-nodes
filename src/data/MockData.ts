import type { ValidatorData } from '../scene/ValidatorField';
import { METACHAIN_SHARD_ID } from '../utils/config';
import { seededSequence } from '../utils/math';

// Staking provider names — creates natural sub-clusters of validators
const STAKING_PROVIDERS = [
  { name: 'Staking Agency', count: 48, baseRating: 97 },
  { name: 'TrustStaking', count: 42, baseRating: 96 },
  { name: 'ARC Stake', count: 55, baseRating: 98 },
  { name: 'Validator.com', count: 38, baseRating: 95 },
  { name: 'MultiversX Foundation', count: 60, baseRating: 99 },
  { name: 'Istari Vision', count: 35, baseRating: 97 },
  { name: 'EverstakePool', count: 50, baseRating: 96 },
  { name: 'Helios Staking', count: 30, baseRating: 94 },
  { name: 'MGStaking', count: 25, baseRating: 93 },
  { name: 'DeFi Labs', count: 40, baseRating: 95 },
  { name: 'ElrondNodes', count: 28, baseRating: 92 },
  { name: 'StakeGold', count: 22, baseRating: 91 },
  { name: 'XStake', count: 45, baseRating: 96 },
  { name: 'SpaceShield', count: 32, baseRating: 97 },
  { name: 'NodeMasters', count: 20, baseRating: 90 },
  { name: 'ValidatorOne', count: 36, baseRating: 94 },
  { name: 'BlockDaemon', count: 44, baseRating: 98 },
  { name: 'ChainSentry', count: 26, baseRating: 93 },
  { name: 'HashGuard', count: 18, baseRating: 89 },
  { name: 'ProofSystems', count: 34, baseRating: 95 },
  { name: 'NebulaNexus', count: 40, baseRating: 96 },
  { name: 'CosmicValidators', count: 30, baseRating: 94 },
  { name: 'StarForge', count: 35, baseRating: 97 },
  { name: 'QuantumNode', count: 28, baseRating: 93 },
  { name: 'AetherStake', count: 22, baseRating: 91 },
  { name: 'Independent', count: 0, baseRating: 85 }, // fills remaining
];

// Mock BLS key generator — produces realistic-looking hex strings
function mockBlsKey(seed: string): string {
  const rng = seededSequence(seed);
  let key = '';
  for (let i = 0; i < 96; i++) {
    key += Math.floor(rng.next() * 16).toString(16);
  }
  return key;
}

// Pareto distribution for stake — most at base, few whales
function paretoStake(rng: { next(): number }): string {
  const base = 2500;
  const alpha = 1.5;
  const u = rng.next();
  const stake = base / Math.pow(1 - u * 0.95, 1 / alpha);
  // Clamp to reasonable range: 2500 - 100000 EGLD
  const clamped = Math.min(100000, Math.max(base, stake));
  return Math.floor(clamped).toString() + '000000000000000000';
}

export interface MockValidator extends ValidatorData {
  name: string;
  provider: string;
  identity: string;
  leaderSuccess: number;
  leaderFailure: number;
  validatorSuccess: number;
  validatorFailure: number;
  topUp: string;
}

export interface MockBlock {
  hash: string;
  nonce: number;
  round: number;
  shard: number;
  epoch: number;
  txCount: number;
  proposer: string; // BLS key
  timestamp: number;
}

export interface MockTransaction {
  txHash: string;
  sender: string;
  receiver: string;
  senderShard: number;
  receiverShard: number;
  value: string;
  status: 'success' | 'pending';
  function?: string;
  type: 'transfer' | 'scCall' | 'esdtTransfer';
}

/**
 * Generates rich, realistic mock data for the entire visualization.
 */
export class MockDataGenerator {
  private validators: MockValidator[] = [];
  private blockNonces: Map<number, number> = new Map();
  private roundCounter = 0;
  private epoch = 1247;
  private txCounter = 0;

  // Cached lookups (avoid per-frame allocations)
  private shardValidatorMap: Map<number, MockValidator[]> = new Map();
  private blsValidatorMap: Map<string, MockValidator> = new Map();
  private cachedOnlineCount = 0;

  constructor() {
    this.generateValidators();
    this.buildCaches();
    // Initialize block nonces per shard
    for (const shard of [0, 1, 2, METACHAIN_SHARD_ID]) {
      this.blockNonces.set(shard, 10000 + Math.floor(Math.random() * 5000));
    }
  }

  private generateValidators(): void {
    const shards = [0, 1, 2, METACHAIN_SHARD_ID];
    let validatorIndex = 0;

    for (const provider of STAKING_PROVIDERS) {
      const count =
        provider.name === 'Independent'
          ? Math.max(0, 3200 - validatorIndex) // fill remainder
          : provider.count;

      for (let i = 0; i < count && validatorIndex < 3200; i++) {
        const shard = shards[validatorIndex % 4];
        // Metachain gets fewer validators (every 4th goes to meta, but skip some)
        const actualShard =
          shard === METACHAIN_SHARD_ID && validatorIndex % 8 !== 0
            ? validatorIndex % 3
            : shard;

        const seed = `${provider.name}_${i}_${validatorIndex}`;
        const rng = seededSequence(seed);
        const bls = mockBlsKey(seed);

        // Rating: base ± small variation, with rare low performers
        let rating = provider.baseRating + (rng.next() - 0.5) * 6;
        if (rng.next() < 0.03) rating = 40 + rng.next() * 30; // 3% chance of poor performer
        rating = Math.max(0, Math.min(100, rating));

        const nodeName =
          provider.name === 'Independent'
            ? `Validator-${validatorIndex}`
            : `${provider.name} #${i + 1}`;

        const leaderSuccess = Math.floor(500 + rng.next() * 9500);
        const leaderFailure = Math.floor(rng.next() * leaderSuccess * 0.02);

        this.validators.push({
          bls,
          shard: actualShard,
          rating,
          stake: paretoStake(rng),
          online: rng.next() > 0.03, // 97% online
          name: nodeName,
          provider: provider.name,
          identity: bls.slice(0, 12),
          leaderSuccess,
          leaderFailure,
          validatorSuccess: leaderSuccess * 3 + Math.floor(rng.next() * 5000),
          validatorFailure: leaderFailure * 2 + Math.floor(rng.next() * 50),
          topUp: Math.floor(rng.next() * 5000).toString() + '000000000000000000',
        });

        validatorIndex++;
      }
    }
  }

  private buildCaches(): void {
    this.shardValidatorMap.clear();
    this.blsValidatorMap.clear();
    for (const v of this.validators) {
      if (!this.shardValidatorMap.has(v.shard)) {
        this.shardValidatorMap.set(v.shard, []);
      }
      this.shardValidatorMap.get(v.shard)!.push(v);
      this.blsValidatorMap.set(v.bls, v);
    }
    this.cachedOnlineCount = this.validators.filter((v) => v.online).length;
  }

  getValidators(): MockValidator[] {
    return this.validators;
  }

  /** Get validators as base ValidatorData (for ValidatorField) */
  getValidatorData(): ValidatorData[] {
    return this.validators.map((v) => ({
      bls: v.bls,
      shard: v.shard,
      rating: v.rating,
      stake: v.stake,
      online: v.online,
    }));
  }

  /** Get a validator by index */
  getValidator(index: number): MockValidator | undefined {
    return this.validators[index];
  }

  /** Get a validator by BLS key (O(1)) */
  getValidatorByBls(bls: string): MockValidator | undefined {
    return this.blsValidatorMap.get(bls);
  }

  /** Get random validator from a specific shard (O(1) lookup, O(1) pick) */
  getRandomValidatorInShard(shard: number): MockValidator {
    const shardValidators = this.shardValidatorMap.get(shard) ?? this.validators;
    return shardValidators[Math.floor(Math.random() * shardValidators.length)];
  }

  /** Generate a new mock block for a shard */
  generateBlock(shard: number): MockBlock {
    const nonce = (this.blockNonces.get(shard) ?? 10000) + 1;
    this.blockNonces.set(shard, nonce);
    this.roundCounter++;

    const proposer = this.getRandomValidatorInShard(shard);
    const rng = seededSequence(`block_${shard}_${nonce}`);

    return {
      hash: mockBlsKey(`blockhash_${shard}_${nonce}`).slice(0, 64),
      nonce,
      round: this.roundCounter,
      shard,
      epoch: this.epoch,
      txCount: Math.floor(5 + rng.next() * 50),
      proposer: proposer.bls,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  /** Generate a batch of mock transactions */
  generateTransactions(count: number): MockTransaction[] {
    const txs: MockTransaction[] = [];
    const shards = [0, 1, 2];

    for (let i = 0; i < count; i++) {
      this.txCounter++;
      const rng = seededSequence(`tx_${this.txCounter}_${Date.now()}_${Math.random()}`);

      const senderShard = shards[Math.floor(rng.next() * 3)];
      // 70% intra-shard, 30% cross-shard
      const isCrossShard = rng.next() < 0.3;
      const receiverShard = isCrossShard
        ? shards.filter((s) => s !== senderShard)[Math.floor(rng.next() * 2)]
        : senderShard;

      const sender = this.getRandomValidatorInShard(senderShard);
      const receiver = this.getRandomValidatorInShard(receiverShard);

      // Value: log-normal distribution
      // Most txs: 0.01 - 10 EGLD, rare: 100-10000 EGLD
      const logValue = -2 + rng.next() * 4 + (rng.next() < 0.05 ? rng.next() * 4 : 0);
      const value = Math.pow(10, logValue);
      const valueWei = Math.floor(value * 1e18).toString();

      // Type distribution: 60% transfer, 25% SC call, 15% ESDT
      let type: MockTransaction['type'] = 'transfer';
      let func: string | undefined;
      const typeRoll = rng.next();
      if (typeRoll > 0.75) {
        type = 'scCall';
        const scFuncs = ['swap', 'stake', 'claim', 'addLiquidity', 'harvest', 'delegate', 'withdraw', 'wrapEgld', 'unwrapEgld', 'enterFarm'];
        func = scFuncs[Math.floor(rng.next() * scFuncs.length)];
      } else if (typeRoll > 0.6) {
        type = 'esdtTransfer';
      }

      txs.push({
        txHash: mockBlsKey(`txhash_${this.txCounter}`).slice(0, 64),
        sender: sender.bls,
        receiver: receiver.bls,
        senderShard,
        receiverShard,
        value: valueWei,
        status: 'success',
        function: func,
        type,
      });
    }

    return txs;
  }

  /** Generate a supernova burst — massive transaction flood */
  generateSupernovaBurst(): MockTransaction[] {
    const count = 100 + Math.floor(Math.random() * 50);
    const txs = this.generateTransactions(count);
    // Force more cross-shard in bursts (60% cross-shard)
    const shards = [0, 1, 2];
    for (const tx of txs) {
      if (Math.random() < 0.6 && tx.senderShard === tx.receiverShard) {
        tx.receiverShard = shards.filter((s) => s !== tx.senderShard)[
          Math.floor(Math.random() * 2)
        ];
        const receiver = this.getRandomValidatorInShard(tx.receiverShard);
        tx.receiver = receiver.bls;
      }
    }
    return txs;
  }

  getRoundCounter(): number {
    return this.roundCounter;
  }

  getEpoch(): number {
    return this.epoch;
  }

  getOnlineCount(): number {
    return this.cachedOnlineCount;
  }
}

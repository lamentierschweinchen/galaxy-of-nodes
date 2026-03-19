import {
  type BlockData,
  type DataSource,
  type DataSourceCallbacks,
  type NetworkStats,
  type TransactionData,
  type ValidatorInfo,
} from './DataSource';
import { METACHAIN_SHARD_ID, NETWORK_API_BASES, type NetworkId } from '../utils/config';

type ApiListResponse<T> = T[] | { data?: T[] };

interface ApiNode {
  bls?: string;
  shard?: number;
  rating?: number;
  ratingModifier?: number;
  stake?: string | number;
  online?: boolean;
  name?: string;
  provider?: string;
  identity?: string;
  [key: string]: unknown;
}

interface ApiBlock {
  hash?: string;
  nonce?: number;
  round?: number;
  shard?: number;
  epoch?: number;
  txCount?: number;
  proposer?: string;
  timestamp?: number;
  [key: string]: unknown;
}

interface ApiStats {
  shards?: number;
  epoch?: number;
  roundsPassed?: number;
  roundsPerEpoch?: number;
  transactions?: number;
  accounts?: number;
  tps?: number;
  [key: string]: unknown;
}

interface ApiTransaction {
  txHash?: string;
  hash?: string;
  sender?: string;
  receiver?: string;
  senderShard?: number;
  receiverShard?: number;
  sourceShard?: number;
  destinationShard?: number;
  value?: string | number;
  status?: string;
  function?: string;
  action?: string;
  [key: string]: unknown;
}

function getListData<T>(payload: ApiListResponse<T>): T[] {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.data) ? payload.data : [];
}

function sanitizePollInterval(ms: number): number {
  if (!Number.isFinite(ms)) return 6_000;
  return Math.max(1000, Math.min(6_000, Math.round(ms)));
}

export class LiveDataSource implements DataSource {
  private readonly network: NetworkId;
  private readonly apiBase: string;
  private readonly pollIntervalMs: number;

  private callbacks?: DataSourceCallbacks;
  private validators: ValidatorInfo[] = [];
  private pollTimer: number | null = null;
  private readonly lastBlockNonces = new Map<number, number>();
  private lastTotalTransactions: number | null = null;
  private lastStatsRequestAtMs: number | null = null;
  private skipNextBlockPoll = false;

  private currentStats: NetworkStats = {
    shards: 4,
    epoch: 0,
    roundsPassed: 0,
    roundsPerEpoch: 0,
    transactions: 0,
    accounts: 0,
  };

  private currentRound = 0;

  constructor(network: NetworkId, pollIntervalMs: number) {
    this.network = network;
    this.apiBase = NETWORK_API_BASES[network];
    this.pollIntervalMs = sanitizePollInterval(pollIntervalMs);
  }

  async initialize(): Promise<void> {
    this.validators = await this.fetchValidators();
    this.currentStats = await this.fetchStats();
    this.currentRound = this.computeRoundFromStats(this.currentStats);
    this.lastTotalTransactions = this.currentStats.transactions;
    this.lastStatsRequestAtMs = Date.now();

    const shards = [0, 1, 2, METACHAIN_SHARD_ID];
    for (const shard of shards) {
      const latestBlock = await this.fetchLatestBlock(shard);
      if (latestBlock) {
        this.lastBlockNonces.set(shard, latestBlock.nonce);
      }
    }

    this.skipNextBlockPoll = true;

  }

  start(callbacks: DataSourceCallbacks): void {
    this.callbacks = callbacks;
    callbacks.onValidatorsLoaded(this.validators);

    callbacks.onStatsUpdate({
      tps: 0,
      totalTransactions: this.currentStats.transactions,
      epoch: this.currentStats.epoch,
      round: this.currentRound,
    });

    this.pollTimer = window.setInterval(() => {
      this.poll().catch((error) => {
        console.error(`[LiveDataSource:${this.network}] Poll failed`, error);
      });
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.callbacks = undefined;
  }

  getValidators(): ValidatorInfo[] {
    return this.validators;
  }

  getValidator(index: number): ValidatorInfo | undefined {
    return this.validators[index];
  }

  getRandomValidatorInShard(shard: number): ValidatorInfo {
    if (this.validators.length === 0) {
      return {
        bls: 'unknown',
        shard,
        rating: 0,
        stake: '0',
        online: false,
        name: 'Unknown validator',
        provider: 'Unknown provider',
        identity: 'unknown',
      };
    }

    const shardValidators = this.validators.filter((validator) => validator.shard === shard);
    const source = shardValidators.length > 0 ? shardValidators : this.validators;
    return source[Math.floor(Math.random() * source.length)];
  }

  getOnlineCount(): number {
    return this.validators.filter((v) => v.online).length;
  }

  private async poll(): Promise<void> {
    if (!this.callbacks) return;

    if (this.skipNextBlockPoll) {
      this.skipNextBlockPoll = false;
    } else {
      const shards = [0, 1, 2, METACHAIN_SHARD_ID];
      for (const shard of shards) {
        const latestBlock = await this.fetchLatestBlock(shard);
        const knownNonce = this.lastBlockNonces.get(shard) ?? -1;

        if (latestBlock && latestBlock.nonce > knownNonce) {
          this.lastBlockNonces.set(shard, latestBlock.nonce);
          this.callbacks.onNewBlock(latestBlock);
        }
      }
    }

    const nextStats = await this.fetchStats();
    const nowMs = Date.now();
    const previousTotal = this.lastTotalTransactions ?? nextStats.transactions;
    const deltaTransactions = Math.max(0, nextStats.transactions - previousTotal);
    const elapsedMs = this.lastStatsRequestAtMs === null
      ? this.pollIntervalMs
      : Math.max(1, nowMs - this.lastStatsRequestAtMs);
    const elapsedSeconds = elapsedMs / 1000;
    const computedTps = deltaTransactions / elapsedSeconds;

    this.lastStatsRequestAtMs = nowMs;
    this.lastTotalTransactions = nextStats.transactions;
    this.currentStats = nextStats;
    this.currentRound = this.computeRoundFromStats(nextStats);

    const freshTxs = this.createSyntheticTransactionsFromDelta(deltaTransactions);

    const latestTransactions = await this.fetchLatestTransactions(25);
    const emittedTransactions = [...latestTransactions, ...freshTxs];

    if (emittedTransactions.length > 0) {
      this.callbacks.onNewTransactions(emittedTransactions);
    }

    this.callbacks.onStatsUpdate({
      tps: computedTps,
      totalTransactions: this.currentStats.transactions,
      epoch: this.currentStats.epoch,
      round: this.currentRound,
    });
  }

  private async fetchValidators(): Promise<ValidatorInfo[]> {
    const payload = await this.fetchJson<ApiListResponse<ApiNode>>('/nodes?type=validator&size=10000');
    const nodes = getListData(payload);

    return nodes
      .filter((node) => Boolean(node.bls))
      .map((node, index): ValidatorInfo => {
        const bls = String(node.bls);
        const shard = Number.isFinite(node.shard) ? Number(node.shard) : 0;
        const hasRating = Number.isFinite(node.rating);
        const hasRatingModifier = Number.isFinite(node.ratingModifier);
        const rating = hasRating
          ? Math.max(0, Math.min(100, Number(node.rating)))
          : hasRatingModifier
            ? Math.max(0, Math.min(100, 50 + Number(node.ratingModifier)))
            : 50;
        const stakeRaw = node.stake ?? '0';
        const stake = typeof stakeRaw === 'number' ? Math.trunc(stakeRaw).toString() : String(stakeRaw);

        return {
          bls,
          shard,
          rating,
          stake,
          online: Boolean(node.online),
          name: node.name ? String(node.name) : `Validator ${index + 1}`,
          provider: node.provider ? String(node.provider) : 'Unknown provider',
          identity: node.identity ? String(node.identity) : bls.slice(0, 12),
        };
      });
  }

  private async fetchLatestBlock(shard: number): Promise<BlockData | null> {
    const payload = await this.fetchJson<ApiListResponse<ApiBlock>>(`/blocks?shard=${shard}&size=1`);
    const blocks = getListData(payload);
    const block = blocks[0];
    if (!block || !block.hash) return null;

    return {
      hash: String(block.hash),
      nonce: Number(block.nonce ?? 0),
      round: Number(block.round ?? 0),
      shard: Number(block.shard ?? shard),
      epoch: Number(block.epoch ?? this.currentStats.epoch ?? 0),
      txCount: Number(block.txCount ?? 0),
      proposer: String(block.proposer ?? ''),
      timestamp: Number(block.timestamp ?? Math.floor(Date.now() / 1000)),
    };
  }

  private sampleVisualCount(realCount: number): number {
    if (realCount <= 0) return 0;
    const sampled = Math.round(Math.sqrt(realCount));
    return Math.max(1, Math.min(40, sampled));
  }

  private createSyntheticTransactionsFromDelta(deltaTransactions: number): TransactionData[] {
    const visualCount = this.sampleVisualCount(deltaTransactions);
    if (visualCount <= 0) return [];

    const shards = [0, 1, 2, METACHAIN_SHARD_ID];
    const txs: TransactionData[] = [];
    const timestamp = Date.now();

    for (let index = 0; index < visualCount; index++) {
      const senderShard = shards[Math.floor(Math.random() * shards.length)];
      const isCrossShard = Math.random() < 0.35;

      let receiverShard = senderShard;
      if (isCrossShard) {
        const possibleReceivers = shards.filter((shard) => shard !== senderShard);
        receiverShard = possibleReceivers[Math.floor(Math.random() * possibleReceivers.length)];
      }

      txs.push({
        txHash: `stats-delta-${timestamp}-${index}`,
        sender: '',
        receiver: '',
        senderShard,
        receiverShard,
        value: '0',
        status: 'stats-delta',
        type: 'transfer',
      });
    }

    return txs;
  }

  private computeRoundFromStats(stats: NetworkStats): number {
    const roundsPassed = Number(stats.roundsPassed ?? 0);

    if (!Number.isFinite(roundsPassed)) {
      return 0;
    }

    const safeRoundsPassed = Math.max(0, Math.floor(roundsPassed));
    return safeRoundsPassed;
  }

  private async fetchLatestTransactions(size: number): Promise<TransactionData[]> {
    const payload = await this.fetchJson<ApiListResponse<ApiTransaction>>(
      `/transactions?size=${size}&order=desc`,
      {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    );

    const txs = getListData(payload);

    return txs
      .filter((tx) => Boolean(tx.txHash || tx.hash))
      .map((tx): TransactionData => {
        const senderShardCandidate = tx.senderShard ?? tx.sourceShard;
        const receiverShardCandidate = tx.receiverShard ?? tx.destinationShard;

        const senderShard =
          typeof senderShardCandidate === 'number' && Number.isFinite(senderShardCandidate)
            ? Number(senderShardCandidate)
            : 0;
        const receiverShard =
          typeof receiverShardCandidate === 'number' && Number.isFinite(receiverShardCandidate)
            ? Number(receiverShardCandidate)
            : senderShard;

        const fn = tx.function ? String(tx.function) : undefined;
        const action = tx.action ? String(tx.action).toLowerCase() : '';
        const lowerFn = fn?.toLowerCase() ?? '';

        let type: TransactionData['type'] = 'transfer';
        if (action.includes('esdt') || lowerFn.includes('esdt')) {
          type = 'esdtTransfer';
        } else if (fn || action.includes('smart contract') || action.includes('sc call')) {
          type = 'scCall';
        }

        return {
          txHash: String(tx.txHash ?? tx.hash),
          sender: String(tx.sender ?? ''),
          receiver: String(tx.receiver ?? ''),
          senderShard,
          receiverShard,
          value: String(tx.value ?? '0'),
          status: String(tx.status ?? 'latest'),
          function: fn,
          type,
        };
      });
  }

  private async fetchStats(): Promise<NetworkStats> {
    const payload = await this.fetchJson<ApiStats>(
      '/stats',
      {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    );

    return {
      shards: Number(payload.shards ?? 4),
      epoch: Number(payload.epoch ?? 0),
      roundsPassed: Number(payload.roundsPassed ?? 0),
      roundsPerEpoch: Number(payload.roundsPerEpoch ?? 0),
      transactions: Number(payload.transactions ?? 0),
      accounts: Number(payload.accounts ?? 0),
      tps: Number(payload.tps ?? 0),
    };
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, init);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${this.apiBase}${path}`);
    }
    return (await response.json()) as T;
  }
}

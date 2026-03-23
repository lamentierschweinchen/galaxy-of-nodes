import {
  DataSource,
  DataSourceCallbacks,
  ValidatorInfo,
  BlockData,
  TransactionData,
} from './DataSource';
import {
  API_BASE,
  POLL_INTERVAL_MS,
  METACHAIN_SHARD_ID,
  API_VALIDATOR_FETCH_SIZE,
  API_BLOCK_FETCH_SIZE,
  API_TX_FETCH_SIZE,
  MAX_POLL_BACKOFF_MS,
} from '../utils/config';

interface ApiNode {
  bls: string;
  rating: number;
  tempRating: number;
  shard: number;
  type: string;
  status: string;
  online: boolean;
  name: string;
  owner: string;
  identity: string;
  provider: string;
  stake: string;
  topUp?: string;
  leaderFailure?: number;
  leaderSuccess?: number;
  validatorFailure?: number;
  validatorSuccess?: number;
}

interface ApiStats {
  shards: number;
  blocks: number;
  accounts: number;
  transactions: number;
  scResults: number;
  refreshRate: number;
  epoch: number;
  roundsPassed: number;
  roundsPerEpoch: number;
}

interface ApiBlock {
  hash: string;
  epoch: number;
  nonce: number;
  proposer: string;
  round: number;
  shard: number;
  txCount: number;
  timestamp: number;
}

interface ApiTransaction {
  txHash: string;
  senderShard: number;
  receiverShard: number;
  sender: string;
  receiver: string;
  status: string;
  value: string;
  function?: string;
  timestamp: number;
}

function classifyTxType(tx: ApiTransaction): 'transfer' | 'scCall' | 'esdtTransfer' {
  const fn = tx.function;
  if (!fn || fn === '') return 'transfer';
  if (fn.toLowerCase().includes('esdt')) return 'esdtTransfer';
  if (fn === 'transfer') return 'transfer';
  return 'scCall';
}

function mapValidator(node: ApiNode): ValidatorInfo {
  return {
    bls: node.bls,
    shard: node.shard,
    rating: node.rating,
    stake: node.stake,
    online: node.online,
    name: node.name || '',
    provider: node.provider || '',
    identity: node.identity || '',
    leaderSuccess: node.leaderSuccess,
    leaderFailure: node.leaderFailure,
    validatorSuccess: node.validatorSuccess,
    validatorFailure: node.validatorFailure,
    topUp: node.topUp,
  };
}

function mapBlock(b: ApiBlock): BlockData {
  return {
    hash: b.hash,
    nonce: b.nonce,
    round: b.round,
    shard: b.shard,
    epoch: b.epoch,
    txCount: b.txCount,
    proposer: b.proposer,
    timestamp: b.timestamp,
  };
}

function mapTransaction(tx: ApiTransaction): TransactionData {
  return {
    txHash: tx.txHash,
    sender: tx.sender,
    receiver: tx.receiver,
    senderShard: tx.senderShard,
    receiverShard: tx.receiverShard,
    value: tx.value,
    status: tx.status,
    function: tx.function,
    type: classifyTxType(tx),
  };
}

export class LiveDataSource implements DataSource {
  private validators: ValidatorInfo[] = [];
  private blsValidatorMap: Map<string, ValidatorInfo> = new Map();
  private shardValidatorMap: Map<number, ValidatorInfo[]> = new Map();
  private onlineCount = 0;

  private callbacks: DataSourceCallbacks | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentPollInterval = POLL_INTERVAL_MS;
  private consecutiveFailures = 0;

  private previousTotalTxs = 0;
  private lastPollTime = 0;
  private currentEpoch = 0;

  // Dedup state
  private seenBlockNonces: Map<number, Set<number>> = new Map(); // shard -> set of nonces
  private seenTxHashes: Set<string> = new Set();
  private readonly MAX_SEEN_TX = 500;

  // Round-robin type index for tx diversity
  private txTypeOrder: Array<'transfer' | 'scCall' | 'esdtTransfer'> = [
    'transfer',
    'scCall',
    'esdtTransfer',
  ];

  async initialize(): Promise<void> {
    // Fetch validators
    const nodes = await this.fetchWithRetry<ApiNode[]>(
      `${API_BASE}/nodes?type=validator&size=${API_VALIDATOR_FETCH_SIZE}`
    );
    this.buildValidatorCaches(nodes);

    // Fetch initial stats for baseline tx count and epoch
    const stats = await this.fetchWithRetry<ApiStats>(`${API_BASE}/stats`);
    this.previousTotalTxs = stats.transactions;
    this.currentEpoch = stats.epoch;
    this.lastPollTime = Date.now();

    // Fetch initial block nonces per shard for dedup baseline
    const shards = this.getShardIds();
    const blockResults = await Promise.allSettled(
      shards.map((shard) =>
        this.fetchWithRetry<ApiBlock[]>(
          `${API_BASE}/blocks?shard=${shard}&size=${API_BLOCK_FETCH_SIZE}`
        )
      )
    );
    for (let i = 0; i < shards.length; i++) {
      const result = blockResults[i];
      if (result.status === 'fulfilled') {
        const nonceSet = new Set<number>();
        for (const block of result.value) {
          nonceSet.add(block.nonce);
        }
        this.seenBlockNonces.set(shards[i], nonceSet);
      }
    }
  }

  start(callbacks: DataSourceCallbacks): void {
    this.callbacks = callbacks;
    this.consecutiveFailures = 0;
    this.currentPollInterval = POLL_INTERVAL_MS;

    // Emit loaded validators immediately
    callbacks.onValidatorsLoaded(this.validators);

    // First poll immediately, then on interval
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), this.currentPollInterval);
  }

  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.callbacks = null;
  }

  getValidators(): ValidatorInfo[] {
    return this.validators;
  }

  getValidator(index: number): ValidatorInfo | undefined {
    return this.validators[index];
  }

  getRandomValidatorInShard(shard: number): ValidatorInfo {
    const shardValidators = this.shardValidatorMap.get(shard);
    if (!shardValidators || shardValidators.length === 0) {
      // Fallback: return first validator
      return this.validators[0];
    }
    const idx = Math.floor(Math.random() * shardValidators.length);
    return shardValidators[idx];
  }

  getOnlineCount(): number {
    return this.onlineCount;
  }

  // --- Private ---

  private buildValidatorCaches(nodes: ApiNode[]): void {
    this.validators = nodes.map(mapValidator);
    this.blsValidatorMap.clear();
    this.shardValidatorMap.clear();
    this.onlineCount = 0;

    for (const v of this.validators) {
      this.blsValidatorMap.set(v.bls, v);
      if (!this.shardValidatorMap.has(v.shard)) {
        this.shardValidatorMap.set(v.shard, []);
      }
      this.shardValidatorMap.get(v.shard)!.push(v);
      if (v.online) this.onlineCount++;
    }
  }

  private getShardIds(): number[] {
    const shards = new Set<number>();
    for (const v of this.validators) {
      shards.add(v.shard);
    }
    // Ensure metachain is included
    shards.add(METACHAIN_SHARD_ID);
    return Array.from(shards).sort((a, b) => a - b);
  }

  private async poll(): Promise<void> {
    if (!this.callbacks) return;

    try {
      const shards = this.getShardIds();

      // Fetch stats, blocks per shard, and transactions in parallel
      const [statsResult, ...rest] = await Promise.allSettled([
        this.fetchWithRetry<ApiStats>(`${API_BASE}/stats`),
        ...shards.map((shard) =>
          this.fetchWithRetry<ApiBlock[]>(
            `${API_BASE}/blocks?shard=${shard}&size=${API_BLOCK_FETCH_SIZE}`
          )
        ),
        this.fetchWithRetry<ApiTransaction[]>(
          `${API_BASE}/transactions?size=${API_TX_FETCH_SIZE}&order=desc`
        ),
      ]);

      const blockResults = rest.slice(0, shards.length);
      const txResult = rest[shards.length];

      // Process stats
      if (statsResult.status === 'fulfilled') {
        const stats = statsResult.value;
        const now = Date.now();
        const elapsed = (now - this.lastPollTime) / 1000;
        const txDelta = stats.transactions - this.previousTotalTxs;
        const tps = elapsed > 0 ? Math.max(0, txDelta / elapsed) : 0;

        this.callbacks.onStatsUpdate({
          tps: Math.round(tps * 100) / 100,
          totalTransactions: stats.transactions,
          epoch: stats.epoch,
          round: stats.roundsPassed,
        });

        // Refresh validators on epoch change (non-blocking)
        if (stats.epoch !== this.currentEpoch) {
          this.currentEpoch = stats.epoch;
          this.refreshValidators();
        }

        this.previousTotalTxs = stats.transactions;
        this.lastPollTime = now;
      }

      // Process blocks - dedup by nonce per shard
      for (let i = 0; i < shards.length; i++) {
        const result = blockResults[i];
        if (result.status !== 'fulfilled') continue;
        const shard = shards[i];
        const blocks = result.value as ApiBlock[];

        if (!this.seenBlockNonces.has(shard)) {
          this.seenBlockNonces.set(shard, new Set());
        }
        const seen = this.seenBlockNonces.get(shard)!;

        for (const block of blocks) {
          if (!seen.has(block.nonce)) {
            seen.add(block.nonce);
            this.callbacks.onNewBlock(mapBlock(block));
          }
        }

        // Bound the seen set: keep only the latest nonces
        if (seen.size > 100) {
          const sorted = Array.from(seen).sort((a, b) => b - a);
          const keep = new Set(sorted.slice(0, 50));
          this.seenBlockNonces.set(shard, keep);
        }
      }

      // Process transactions - dedup by hash, diversity selection
      if (txResult.status === 'fulfilled') {
        const rawTxs = txResult.value as ApiTransaction[];
        const newTxs: TransactionData[] = [];

        for (const raw of rawTxs) {
          if (!this.seenTxHashes.has(raw.txHash)) {
            this.seenTxHashes.add(raw.txHash);
            newTxs.push(mapTransaction(raw));
          }
        }

        // Bound the seen tx set
        if (this.seenTxHashes.size > this.MAX_SEEN_TX) {
          const arr = Array.from(this.seenTxHashes);
          this.seenTxHashes = new Set(arr.slice(arr.length - this.MAX_SEEN_TX));
        }

        if (newTxs.length > 0) {
          // Round-robin diversity: reorder to prioritize showing one of each type
          const sorted = this.diversifyTransactions(newTxs);
          this.callbacks.onNewTransactions(sorted);
        }
      }

      // Reset backoff on success
      this.consecutiveFailures = 0;
      if (this.currentPollInterval !== POLL_INTERVAL_MS) {
        this.currentPollInterval = POLL_INTERVAL_MS;
        this.resetPollInterval();
      }
    } catch (err) {
      this.consecutiveFailures++;
      console.warn(`[LiveDataSource] Poll failure #${this.consecutiveFailures}:`, err);

      if (this.consecutiveFailures >= 3) {
        const newInterval = Math.min(this.currentPollInterval * 2, MAX_POLL_BACKOFF_MS);
        if (newInterval !== this.currentPollInterval) {
          this.currentPollInterval = newInterval;
          this.resetPollInterval();
          console.warn(`[LiveDataSource] Backing off poll interval to ${newInterval}ms`);
        }
      }
    }
  }

  private diversifyTransactions(txs: TransactionData[]): TransactionData[] {
    if (txs.length <= 3) return txs;

    const buckets: Map<string, TransactionData[]> = new Map();
    for (const type of this.txTypeOrder) {
      buckets.set(type, []);
    }
    for (const tx of txs) {
      const bucket = buckets.get(tx.type);
      if (bucket) bucket.push(tx);
    }

    const result: TransactionData[] = [];
    const used = new Set<string>();

    // First pass: one of each type (round-robin)
    for (const type of this.txTypeOrder) {
      const bucket = buckets.get(type)!;
      if (bucket.length > 0) {
        result.push(bucket[0]);
        used.add(bucket[0].txHash);
      }
    }

    // Second pass: remaining in original order
    for (const tx of txs) {
      if (!used.has(tx.txHash)) {
        result.push(tx);
      }
    }

    return result;
  }

  private resetPollInterval(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.poll(), this.currentPollInterval);
    }
  }

  private async refreshValidators(): Promise<void> {
    try {
      const nodes = await this.fetchWithRetry<ApiNode[]>(
        `${API_BASE}/nodes?type=validator&size=${API_VALIDATOR_FETCH_SIZE}`
      );
      this.buildValidatorCaches(nodes);
      if (this.callbacks) {
        this.callbacks.onValidatorsLoaded(this.validators);
      }
    } catch (err) {
      console.warn('[LiveDataSource] Failed to refresh validators on epoch change:', err);
    }
  }

  private async fetchWithRetry<T>(url: string, retries = 2): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url);

        if (response.status === 429) {
          // Rate limited: exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await this.sleep(delay);
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retries) {
          const delay = Math.min(500 * Math.pow(2, attempt), 4000);
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

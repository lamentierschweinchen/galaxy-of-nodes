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
  STATS_EVERY_N_POLLS,
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
  timestampMs?: number;
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

const BLOCK_FIELDS = 'hash,nonce,round,shard,epoch,txCount,proposer,timestamp,timestampMs';
const TX_FIELDS =
  'txHash,sender,receiver,senderShard,receiverShard,value,status,function,timestamp';
const NODE_FIELDS =
  'bls,rating,tempRating,shard,type,status,online,name,owner,identity,provider,stake,topUp,' +
  'leaderFailure,leaderSuccess,validatorFailure,validatorSuccess';

// The API serves /stats with cache-control: max-age=14400, so without this a browser
// keeps replaying a stats response up to four hours old.
const NO_BROWSER_CACHE: RequestInit = { cache: 'no-store' };
// A hung request must not stall the poll loop; the validator list is ~2MB, so it gets longer
const FETCH_TIMEOUT_MS = 20_000;
const NODES_TIMEOUT_MS = 60_000;

function blockTimeMs(b: ApiBlock): number {
  return b.timestampMs ?? b.timestamp * 1000;
}

export class LiveDataSource implements DataSource {
  private validators: ValidatorInfo[] = [];
  private blsValidatorMap: Map<string, ValidatorInfo> = new Map();
  private shardValidatorMap: Map<number, ValidatorInfo[]> = new Map();
  private onlineCount = 0;

  private callbacks: DataSourceCallbacks | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private replayTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private polling = false;
  private pollCount = 0;
  private currentPollInterval = POLL_INTERVAL_MS;
  private consecutiveFailures = 0;
  private lastBatchAt = 0; // when the last successful blocks response arrived

  // Network stats, refreshed every STATS_EVERY_N_POLLS polls
  private totalTxs = 0;
  private lastStatsTime = 0;
  private tps = 0;
  private currentEpoch = 0;
  // Absolute round at which the current epoch began; the HUD shows rounds into the epoch
  private epochStartRound = 0;
  private lastEmittedRound = 0;

  // Dedup state
  private seenBlocks: Set<string> = new Set(); // `${shard}:${nonce}`
  private readonly MAX_SEEN_BLOCKS = 600;
  private seenTxHashes: Set<string> = new Set();
  private readonly MAX_SEEN_TX = 500;

  // Round-robin type index for tx diversity
  private txTypeOrder: Array<'transfer' | 'scCall' | 'esdtTransfer'> = [
    'transfer',
    'scCall',
    'esdtTransfer',
  ];

  async initialize(): Promise<void> {
    const nodes = await this.fetchJson<ApiNode[]>(
      `${API_BASE}/nodes?type=validator&size=${API_VALIDATOR_FETCH_SIZE}&fields=${NODE_FIELDS}`,
      2,
      undefined,
      NODES_TIMEOUT_MS
    );
    this.buildValidatorCaches(nodes);

    // Baseline stats and block dedup, taken together so the round anchor lines up
    const [stats, blocks] = await Promise.all([
      this.fetchJson<ApiStats>(`${API_BASE}/stats`, 2, NO_BROWSER_CACHE),
      this.fetchJson<ApiBlock[]>(this.blocksUrl(), 2),
    ]);
    for (const block of blocks) this.markBlockSeen(block);
    this.lastBatchAt = Date.now();
    this.applyStats(stats, blocks);
  }

  start(callbacks: DataSourceCallbacks): void {
    this.callbacks = callbacks;
    this.consecutiveFailures = 0;
    this.currentPollInterval = POLL_INTERVAL_MS;
    // initialize() just fetched stats; refresh them on the second poll, then every N
    this.pollCount = STATS_EVERY_N_POLLS - 1;

    callbacks.onValidatorsLoaded(this.validators);
    this.emitStats();

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    void this.poll();
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.clearTimers();
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

  private blocksUrl(): string {
    return `${API_BASE}/blocks?size=${API_BLOCK_FETCH_SIZE}&fields=${BLOCK_FIELDS}`;
  }

  // Hidden tabs stop polling entirely, so a background tab costs the API nothing
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearTimers();
    } else if (this.callbacks && this.pollTimer === null && !this.polling) {
      void this.poll();
    }
  };

  private clearTimers(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timer of this.replayTimers) clearTimeout(timer);
    this.replayTimers.clear();
  }

  private schedulePoll(delay: number): void {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.poll();
    }, delay);
  }

  /**
   * One poll: blocks for all shards, the latest transactions, and network stats every
   * few polls. Polls never overlap; the next is scheduled once this one settles.
   */
  private async poll(): Promise<void> {
    if (!this.callbacks || this.polling || document.hidden) return;
    this.polling = true;
    const pollStartedAt = Date.now();

    const includeStats = this.pollCount % STATS_EVERY_N_POLLS === 0;
    this.pollCount++;

    const [blocksResult, txResult, statsResult] = await Promise.allSettled([
      this.fetchJson<ApiBlock[]>(this.blocksUrl()),
      this.fetchJson<ApiTransaction[]>(
        `${API_BASE}/transactions?size=${API_TX_FETCH_SIZE}&order=desc&fields=${TX_FIELDS}`
      ),
      includeStats
        ? this.fetchJson<ApiStats>(`${API_BASE}/stats`, 0, NO_BROWSER_CACHE)
        : Promise.resolve(null),
    ]);
    this.polling = false;
    if (!this.callbacks) return;

    // Any failed request backs the whole loop off. The API's rate limiter answers 429
    // without CORS headers, so the browser reports it as a network error, not a status.
    const failed = [blocksResult, txResult, statsResult].some((r) => r.status === 'rejected');
    if (failed) {
      this.consecutiveFailures++;
      this.currentPollInterval = Math.min(
        POLL_INTERVAL_MS * 2 ** this.consecutiveFailures,
        MAX_POLL_BACKOFF_MS
      );
      console.warn(
        `[LiveDataSource] Poll failed (${this.consecutiveFailures} in a row), ` +
          `next poll in ${this.currentPollInterval / 1000}s`
      );
    } else {
      this.consecutiveFailures = 0;
      this.currentPollInterval = POLL_INTERVAL_MS;
    }

    if (statsResult.status === 'fulfilled' && statsResult.value) {
      this.applyStats(
        statsResult.value,
        blocksResult.status === 'fulfilled' ? blocksResult.value : []
      );
    }
    if (blocksResult.status === 'fulfilled') {
      // Spread this batch over the time the previous one took to arrive, which includes
      // API latency, so pulses stay continuous even when responses are slow
      const now = Date.now();
      const sinceLastBatch = now - this.lastBatchAt;
      this.lastBatchAt = now;
      this.replayBlocks(blocksResult.value, sinceLastBatch);
    }
    if (txResult.status === 'fulfilled') this.emitTransactions(txResult.value);

    // Keep a steady cadence: time spent waiting on the API counts toward the interval
    const elapsed = Date.now() - pollStartedAt;
    if (!document.hidden) this.schedulePoll(Math.max(0, this.currentPollInterval - elapsed));
  }

  private applyStats(stats: ApiStats, blocks: ApiBlock[]): void {
    const now = Date.now();
    if (this.lastStatsTime > 0 && now > this.lastStatsTime) {
      const txDelta = Math.max(0, stats.transactions - this.totalTxs);
      this.tps = Math.round((txDelta / ((now - this.lastStatsTime) / 1000)) * 100) / 100;
    }
    this.totalTxs = stats.transactions;
    this.lastStatsTime = now;

    // Anchor the epoch's start round to the newest block fetched alongside these stats
    const newestRound = blocks.reduce((max, b) => Math.max(max, b.round), 0);
    if (newestRound > 0) this.epochStartRound = newestRound - stats.roundsPassed;

    if (stats.epoch > this.currentEpoch) {
      const isFirstLoad = this.currentEpoch === 0;
      this.currentEpoch = stats.epoch;
      this.lastEmittedRound = stats.roundsPassed;
      if (!isFirstLoad) this.refreshValidators();
    }
    this.emitStats();
  }

  private emitStats(): void {
    this.callbacks?.onStatsUpdate({
      tps: this.tps,
      totalTransactions: this.totalTxs,
      epoch: this.currentEpoch,
      round: Math.max(0, this.lastEmittedRound),
    });
  }

  /** Returns true the first time a block is seen. */
  private markBlockSeen(block: ApiBlock): boolean {
    const key = `${block.shard}:${block.nonce}`;
    if (this.seenBlocks.has(key)) return false;
    this.seenBlocks.add(key);
    if (this.seenBlocks.size > this.MAX_SEEN_BLOCKS) {
      // Sets iterate in insertion order, so the first entries are the oldest
      let excess = this.seenBlocks.size - this.MAX_SEEN_BLOCKS;
      for (const k of this.seenBlocks) {
        if (excess-- <= 0) break;
        this.seenBlocks.delete(k);
      }
    }
    return true;
  }

  /** Replays fresh blocks in chain order, spread across roughly one poll cycle. */
  private replayBlocks(blocks: ApiBlock[], cycleMs: number): void {
    const fresh = blocks
      .filter((b) => this.markBlockSeen(b))
      .sort((a, b) => blockTimeMs(a) - blockTimeMs(b));
    if (fresh.length === 0) return;

    const first = blockTimeMs(fresh[0]);
    const span = blockTimeMs(fresh[fresh.length - 1]) - first;
    const windowMs = Math.min(Math.max(cycleMs, 1000), MAX_POLL_BACKOFF_MS) * 0.9;
    const scale = span > windowMs ? windowMs / span : 1;

    for (const block of fresh) {
      const timer = setTimeout(() => {
        this.replayTimers.delete(timer);
        this.emitBlock(block);
      }, (blockTimeMs(block) - first) * scale);
      this.replayTimers.add(timer);
    }
  }

  private emitBlock(block: ApiBlock): void {
    if (!this.callbacks) return;

    if (block.epoch > this.currentEpoch) {
      // Epoch rollover seen in blocks before the next stats refresh
      this.currentEpoch = block.epoch;
      this.epochStartRound = block.round;
      this.lastEmittedRound = -1;
      this.refreshValidators();
    }

    this.callbacks.onNewBlock(mapBlock(block));

    const round = block.round - this.epochStartRound;
    if (round > this.lastEmittedRound) {
      this.lastEmittedRound = round;
      this.emitStats();
    }
  }

  private emitTransactions(rawTxs: ApiTransaction[]): void {
    if (!this.callbacks) return;

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
      this.callbacks.onNewTransactions(this.diversifyTransactions(newTxs));
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

  private async refreshValidators(): Promise<void> {
    try {
      const nodes = await this.fetchJson<ApiNode[]>(
        `${API_BASE}/nodes?type=validator&size=${API_VALIDATOR_FETCH_SIZE}&fields=${NODE_FIELDS}`,
        1,
        undefined,
        NODES_TIMEOUT_MS
      );
      this.buildValidatorCaches(nodes);
      if (this.callbacks) {
        this.callbacks.onValidatorsLoaded(this.validators);
      }
    } catch (err) {
      console.warn('[LiveDataSource] Failed to refresh validators on epoch change:', err);
    }
  }

  /**
   * Polls pass retries = 0: the poll loop is the retry, with backoff. Only startup and
   * the daily validator refresh retry inline, with a few seconds between attempts.
   */
  private async fetchJson<T>(
    url: string,
    retries = 0,
    init?: RequestInit,
    timeoutMs = FETCH_TIMEOUT_MS
  ): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return (await response.json()) as T;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await this.sleep(2000 * 2 ** attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

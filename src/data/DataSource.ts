import type { ValidatorData } from '../scene/ValidatorField';

/**
 * Abstract data source interface.
 * MockDataSource provides simulated data.
 * LiveDataSource (future) connects to MultiversX API.
 */

export interface BlockData {
  hash: string;
  nonce: number;
  round: number;
  shard: number;
  epoch: number;
  txCount: number;
  proposer: string; // BLS key
  timestamp: number;
}

export interface TransactionData {
  txHash: string;
  sender: string;
  receiver: string;
  senderShard: number;
  receiverShard: number;
  value: string;
  status: string;
  function?: string;
  type: 'transfer' | 'scCall' | 'esdtTransfer';
}

export interface NetworkStats {
  shards: number;
  epoch: number;
  roundsPassed: number;
  roundsPerEpoch: number;
  transactions: number;
  accounts: number;
  tps?: number;
}

export interface ValidatorInfo extends ValidatorData {
  name: string;
  provider: string;
  identity: string;
}

export interface DataSourceCallbacks {
  onValidatorsLoaded: (validators: ValidatorInfo[]) => void;
  onNewBlock: (block: BlockData) => void;
  onNewTransactions: (txs: TransactionData[]) => void;
  onStatsUpdate: (stats: { tps: number; totalTransactions: number; epoch: number; round: number }) => void;
}

/**
 * DataSource interface — implement this for mock or live data.
 */
export interface DataSource {
  /** Initialize the data source (fetch initial data) */
  initialize(): Promise<void>;

  /** Start continuous data polling/streaming */
  start(callbacks: DataSourceCallbacks): void;

  /** Stop polling/streaming */
  stop(): void;

  /** Get all validators */
  getValidators(): ValidatorInfo[];

  /** Get validator by index */
  getValidator(index: number): ValidatorInfo | undefined;

  /** Get random validator from a shard */
  getRandomValidatorInShard(shard: number): ValidatorInfo;

  /** Get online validator count */
  getOnlineCount(): number;
}

// ============================================================
// Future LiveDataSource implementation sketch:
// ============================================================
//
// export class LiveDataSource implements DataSource {
//   private apiBase = 'https://api.multiversx.com';
//   private validators: ValidatorInfo[] = [];
//   private pollInterval: number | null = null;
//   private callbacks?: DataSourceCallbacks;
//   private lastBlockNonces = new Map<number, number>();
//   private lastTxHashes = new Set<string>();
//
//   async initialize(): Promise<void> {
//     // Fetch validators: GET /nodes?type=validator&size=10000
//     const resp = await fetch(`${this.apiBase}/nodes?type=validator&size=10000`);
//     const nodes = await resp.json();
//     this.validators = nodes.map((n: any) => ({
//       bls: n.bls,
//       shard: n.shard,
//       rating: n.rating ?? 0,
//       stake: n.stake ?? '0',
//       online: n.online ?? false,
//       name: n.name ?? `Node ${n.bls.slice(0, 8)}`,
//       provider: n.provider ?? 'Unknown',
//       identity: n.identity ?? n.bls.slice(0, 12),
//     }));
//   }
//
//   start(callbacks: DataSourceCallbacks): void {
//     this.callbacks = callbacks;
//     callbacks.onValidatorsLoaded(this.validators);
//
//     // Poll every 6 seconds
//     this.pollInterval = window.setInterval(() => this.poll(), 6000);
//   }
//
//   private async poll(): Promise<void> {
//     // Fetch stats: GET /stats
//     // Fetch blocks per shard: GET /blocks?shard=X&size=1
//     // Fetch recent transactions: GET /transactions?size=50&order=desc
//     // Compare with last known state, emit callbacks for new data
//   }
//
//   stop(): void {
//     if (this.pollInterval) clearInterval(this.pollInterval);
//   }
//
//   // ... getters same as MockDataGenerator
// }

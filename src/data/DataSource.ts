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
}

export interface ValidatorInfo extends ValidatorData {
  name: string;
  provider: string;
  identity: string;
  leaderSuccess?: number;
  leaderFailure?: number;
  validatorSuccess?: number;
  validatorFailure?: number;
  topUp?: string;
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


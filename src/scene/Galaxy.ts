import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { Starfield } from './Starfield';
import { ValidatorField } from './ValidatorField';
import { MetachainCore } from './MetachainCore';
import { DustField } from './DustField';
import { ShardCluster } from './ShardCluster';
import { CameraController } from '../interaction/CameraController';
import { TransactionPool } from '../particles/TransactionPool';
import { MockDataGenerator } from '../data/MockData';
import { SimulationEngine } from '../data/SimulationEngine';
import { LiveDataSource } from '../data/LiveDataSource';
import type { NetworkId } from '../utils/config';
import type { TransactionData } from '../data/DataSource';
import { HUD } from '../interaction/HUD';
import { ValidatorRaycaster } from '../interaction/Raycaster';
import { InfoOverlay } from '../interaction/InfoOverlay';

import {
  BG_COLOR,
  BLOOM_STRENGTH,
  BLOOM_RADIUS,
  BLOOM_THRESHOLD,
  METACHAIN_SHARD_ID,
  DEFAULT_REFRESH_INTERVAL_MS,
} from '../utils/config';

import {
  colorGradeVertexShader,
  colorGradeFragmentShader,
  vignetteVertexShader,
  vignetteFragmentShader,
  filmGrainVertexShader,
  filmGrainFragmentShader,
  chromaticAberrationVertexShader,
  chromaticAberrationFragmentShader,
} from '../shaders/postprocessing';

/**
 * Main scene orchestrator. Creates renderer, camera, post-processing,
 * and all visual + data sub-systems. Call update(dt) and render() each frame.
 */
export class Galaxy {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private composer: EffectComposer;
  private cameraController: CameraController;

  private starfield: Starfield;
  private validatorField: ValidatorField;
  private metachainCore: MetachainCore;
  private dustField: DustField;
  private clusters: ShardCluster[];

  // Phase 3-6 systems
  private txPool: TransactionPool;
  private mockData: MockDataGenerator;
  private simulation: SimulationEngine;
  private hud: HUD;
  private raycaster: ValidatorRaycaster;
  private infoOverlay: InfoOverlay;

  private liveDataSource: LiveDataSource | null = null;
  private selectedNetwork: NetworkId = 'mainnet';
  private refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS;
  private dataMode: 'mock' | 'live' = 'mock';
  private liveRecentTransactions: TransactionData[] = [];
  private maxRecentTxs = 50;
  private liveStats = {
    tps: 0,
    totalTransactions: 0,
    epoch: 0,
    round: 0,
  };

  // Post-processing passes needing per-frame/resize updates
  private filmGrainPass: ShaderPass;
  private caPass: ShaderPass;

  constructor(container: HTMLElement) {
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(BG_COLOR, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.cameraController = new CameraController(camera, this.renderer.domElement);

    // Very dim ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.02);
    this.scene.add(ambient);

    // Shard clusters (data objects)
    this.clusters = [
      new ShardCluster(0),
      new ShardCluster(1),
      new ShardCluster(2),
      new ShardCluster(METACHAIN_SHARD_ID),
    ];

    // --- Mock data ---
    this.mockData = new MockDataGenerator();

    // --- Visual sub-systems ---
    this.starfield = new Starfield();
    this.scene.add(this.starfield.points);

    this.validatorField = new ValidatorField(this.mockData.getValidatorData(), this.clusters);
    this.scene.add(this.validatorField.points);

    this.metachainCore = new MetachainCore();
    this.scene.add(this.metachainCore.mesh);
    this.scene.add(this.metachainCore.light);

    this.dustField = new DustField();
    this.scene.add(this.dustField.points);

    // --- Transaction particles ---
    this.txPool = new TransactionPool();
    this.scene.add(this.txPool.points);

    // --- Simulation engine ---
    this.simulation = new SimulationEngine(
      this.mockData,
      this.txPool,
      this.validatorField,
      this.metachainCore,
    );

    // --- HUD ---
    this.hud = new HUD();
    this.hud.setNetwork(this.selectedNetwork);
    this.hud.setRefreshIntervalMs(this.refreshIntervalMs);

    // --- Raycaster (hover tooltips, click-to-zoom) ---
    this.raycaster = new ValidatorRaycaster(
      camera,
      this.renderer.domElement,
      this.validatorField,
      this.mockData,
    );

    this.raycaster.onValidatorClick((validator) => {
      const pos = this.validatorField.getPositionForBls(validator.bls);
      if (pos) {
        this.cameraController.zoomTo(pos);
      }
    });

    // --- Info overlay (shard labels, tx feed) ---
    this.infoOverlay = new InfoOverlay(camera);
    // Set shard node counts
    const shardCounts = new Map<number, number>();
    const validators = this.mockData.getValidators();
    for (const v of validators) {
      shardCounts.set(v.shard, (shardCounts.get(v.shard) ?? 0) + 1);
    }
    this.infoOverlay.setShardCounts(shardCounts);

    // --- Post-processing ---
    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    this.composer.addPass(bloomPass);

    const colorGradePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.6 },
        uExposure: { value: 1.05 },
        uContrast: { value: 1.05 },
        uSaturation: { value: 1.1 },
      },
      vertexShader: colorGradeVertexShader,
      fragmentShader: colorGradeFragmentShader,
    });
    this.composer.addPass(colorGradePass);

    const vignettePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 0.4 },
        uSoftness: { value: 0.3 },
      },
      vertexShader: vignetteVertexShader,
      fragmentShader: vignetteFragmentShader,
    });
    this.composer.addPass(vignettePass);

    this.filmGrainPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
      },
      vertexShader: filmGrainVertexShader,
      fragmentShader: filmGrainFragmentShader,
    });
    this.composer.addPass(this.filmGrainPass);

    this.caPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uIntensity: { value: 1.5 },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
      vertexShader: chromaticAberrationVertexShader,
      fragmentShader: chromaticAberrationFragmentShader,
    });
    this.composer.addPass(this.caPass);

    this.hud.onNetworkChange((network) => {
      this.selectedNetwork = network;
      this.startLiveData();
    });

    this.hud.onRefreshIntervalChange((intervalMs) => {
      this.refreshIntervalMs = intervalMs;
      this.startLiveData();
    });

    this.startLiveData();
  }

  update(dt: number): void {
    // Update clusters (rotation, breathing)
    for (const cluster of this.clusters) {
      cluster.update(dt);
    }

    // Update visual sub-systems
    this.starfield.update(dt);
    this.validatorField.update(dt, this.clusters);
    this.metachainCore.update(dt);
    this.dustField.update(dt);
    this.cameraController.update(dt);

    // Update transaction particles
    this.txPool.update(dt);

    // Keep ambient simulation running in all modes (live adds real tx overlays)
    this.simulation.update(dt);

    // Update HUD
    if (this.dataMode === 'live' && this.liveDataSource) {
      this.hud.updateStats({
        round: this.liveStats.round,
        epoch: this.liveStats.epoch,
        tps: this.liveStats.tps,
        onlineCount: this.liveDataSource.getOnlineCount(),
        totalTransactions: this.liveStats.totalTransactions,
      });
    } else {
      this.hud.updateStats({
        round: this.mockData.getRoundCounter(),
        epoch: this.mockData.getEpoch(),
        tps: this.simulation.getTps(),
        onlineCount: this.mockData.getOnlineCount(),
        totalTransactions: this.simulation.getTotalTransactions(),
      });
    }

    // Update info overlay (shard labels + tx feed)
    this.infoOverlay.updateLabelPositions();
    if (this.dataMode === 'live') {
      this.infoOverlay.updateTransactionFeed(this.liveRecentTransactions, dt);
    } else {
      this.infoOverlay.updateTransactionFeed(this.simulation.getRecentTransactions(), dt);
    }

    // Film grain needs time
    this.filmGrainPass.uniforms.uTime.value += dt;
  }

  render(): void {
    this.composer.render();
  }

  resize(): void {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer.setSize(width, height);
    this.cameraController.camera.aspect = width / height;
    this.cameraController.camera.updateProjectionMatrix();
    this.composer.setSize(width, height);
    this.caPass.uniforms.uResolution.value.set(width, height);
  }

  dispose(): void {
    this.liveDataSource?.stop();
    this.starfield.dispose();
    this.validatorField.dispose();
    this.metachainCore.dispose();
    this.dustField.dispose();
    this.txPool.dispose();
    this.cameraController.dispose();
    this.raycaster.dispose();
    this.renderer.dispose();
  }

  private async startLiveData(): Promise<void> {
    this.liveDataSource?.stop();

    const dataSource = new LiveDataSource(this.selectedNetwork, this.refreshIntervalMs);
    this.liveDataSource = dataSource;

    try {
      await dataSource.initialize();

      dataSource.start({
        onValidatorsLoaded: (validators) => {
          if (validators.length === 0) return;
          this.validatorField.setValidators(validators, this.clusters);
          this.raycaster.setDataProvider(dataSource);

          const shardCounts = new Map<number, number>();
          for (const validator of validators) {
            shardCounts.set(validator.shard, (shardCounts.get(validator.shard) ?? 0) + 1);
          }
          this.infoOverlay.setShardCounts(shardCounts);
        },
        onNewBlock: (block) => {
          if (block.proposer) {
            this.validatorField.pulseProposer(block.proposer);
          }
          if (block.shard === METACHAIN_SHARD_ID) {
            this.metachainCore.triggerPulse();
          }
        },
        onNewTransactions: (txs) => {
          const latestForFeed = txs.slice(0, 25);
          if (latestForFeed.length > 0) {
            this.liveRecentTransactions = latestForFeed;
          }

          const particleTxs = txs.length > 25 ? txs.slice(25) : txs;
          for (const tx of particleTxs) {
            this.spawnLiveTransactionParticle(tx);
          }
        },
        onStatsUpdate: (stats) => {
          this.liveStats = {
            tps: stats.tps,
            totalTransactions: stats.totalTransactions,
            epoch: stats.epoch,
            round: stats.round,
          };
        },
      });

      this.dataMode = 'live';
    } catch (error) {
      console.error('Failed to start live data source. Falling back to mock simulation.', error);
      this.dataMode = 'mock';
      this.raycaster.setDataProvider(this.mockData);
      this.liveRecentTransactions = [];
    }
  }

  private spawnLiveTransactionParticle(tx: TransactionData): void {
    if (!this.liveDataSource) return;

    const senderValidator = this.liveDataSource.getRandomValidatorInShard(tx.senderShard);
    const receiverValidator = this.liveDataSource.getRandomValidatorInShard(tx.receiverShard);

    const senderPos = this.validatorField.getPositionForBls(senderValidator.bls);
    const receiverPos = this.validatorField.getPositionForBls(receiverValidator.bls);

    if (!senderPos || !receiverPos) return;

    const isCrossShard = tx.senderShard !== tx.receiverShard;
    const valueEgld = Number(tx.value) / 1e18;
    const valueBrightness = Number.isFinite(valueEgld) && valueEgld > 0
      ? Math.min(1.0, 0.3 + Math.log10(valueEgld + 1) * 0.15)
      : 0.3;

    if (isCrossShard && valueBrightness > 0.6) {
      this.txPool.spawnComet(senderPos, receiverPos, tx.type, valueBrightness);
      return;
    }

    this.txPool.spawn(senderPos, receiverPos, isCrossShard, tx.type, valueBrightness);
  }

  private addToRecentLiveTxs(tx: TransactionData): void {
    this.liveRecentTransactions.unshift(tx);
    if (this.liveRecentTransactions.length > this.maxRecentTxs) {
      this.liveRecentTransactions.length = this.maxRecentTxs;
    }
  }
}

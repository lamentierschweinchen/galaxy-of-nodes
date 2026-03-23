import { Galaxy } from './scene/Galaxy';
import { AudioController } from './interaction/AudioController';
import { MockDataGenerator } from './data/MockData';
import { LiveDataSource } from './data/LiveDataSource';
import type { DataSource } from './data/DataSource';

// WebGL detection
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const container = document.getElementById('app')!;
const errorEl = document.getElementById('webgl-error')!;
const loadingEl = document.getElementById('loading');

if (!hasWebGL()) {
  errorEl.style.display = 'block';
} else {
  (async () => {
    // Determine data mode from URL param: ?data=live or ?data=mock (default)
    const params = new URLSearchParams(window.location.search);
    const dataMode = params.get('data') ?? 'mock';
    const isLive = dataMode === 'live';

    let dataSource: DataSource;

    if (isLive) {
      if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.textContent = 'Connecting to MultiversX network...';
      }
      try {
        dataSource = new LiveDataSource();
      } catch {
        console.warn('[Galaxy] LiveDataSource creation failed, falling back to mock');
        dataSource = new MockDataGenerator();
      }
    } else {
      dataSource = new MockDataGenerator();
    }

    try {
      const galaxy = await Galaxy.create(container, dataSource, isLive && dataSource instanceof LiveDataSource);

      if (loadingEl) loadingEl.style.display = 'none';

      new AudioController();

      let lastTime = performance.now();

      function loop(): void {
        requestAnimationFrame(loop);
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        galaxy.update(dt);
        galaxy.render();
      }

      requestAnimationFrame(loop);
      window.addEventListener('resize', () => galaxy.resize());
    } catch (e) {
      console.error('Galaxy initialization failed:', e);

      // If live mode failed during initialize, fall back to mock
      if (isLive) {
        console.warn('[Galaxy] Falling back to mock data');
        if (loadingEl) loadingEl.textContent = 'Network unavailable, loading demo...';
        try {
          const mockSource = new MockDataGenerator();
          const galaxy = await Galaxy.create(container, mockSource, false);

          if (loadingEl) loadingEl.style.display = 'none';

          new AudioController();

          let lastTime = performance.now();
          function loop(): void {
            requestAnimationFrame(loop);
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1);
            lastTime = now;
            galaxy.update(dt);
            galaxy.render();
          }
          requestAnimationFrame(loop);
          window.addEventListener('resize', () => galaxy.resize());
        } catch (e2) {
          console.error('Mock fallback also failed:', e2);
          errorEl.style.display = 'block';
          if (loadingEl) loadingEl.style.display = 'none';
        }
      } else {
        errorEl.style.display = 'block';
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }
  })();
}

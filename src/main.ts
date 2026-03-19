import { Galaxy } from './scene/Galaxy';
import { AudioController } from './interaction/AudioController';

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

if (!hasWebGL()) {
  errorEl.style.display = 'block';
} else {
  try {
    const galaxy = new Galaxy(container);
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
    errorEl.style.display = 'block';
  }
}

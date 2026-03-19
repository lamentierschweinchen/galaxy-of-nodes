import { Galaxy } from './scene/Galaxy';

const container = document.getElementById('app')!;
const galaxy = new Galaxy(container);

// Render loop
let lastTime = performance.now();

function loop(): void {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
  lastTime = now;
  galaxy.update(dt);
  galaxy.render();
}

requestAnimationFrame(loop);

// Handle resize
window.addEventListener('resize', () => galaxy.resize());

# Galaxy of Nodes

A living cosmos visualization of the MultiversX blockchain network. Every validator is a star. Every transaction is a photon of light. Every shard is a star cluster. The metachain pulses at the center.

**[Live Demo](https://galaxy-of-nodes.vercel.app)**

## What You're Seeing

- **3,221 validator stars** across 3 shard clusters + metachain core, with size reflecting stake and brightness reflecting rating
- **Transaction particles** flowing between validators — intra-shard (fast, shard-colored) and cross-shard (routing through metachain)
- **Supernova bursts** every 30 seconds flooding all shards with 100+ transactions
- **1,000–10,000 simulated TPS** with visual particle sampling
- Cinematic post-processing: bloom, color grading, vignette, film grain, chromatic aberration
- Ambient soundtrack with sound toggle

## Interaction

- **Orbit**: drag to rotate, scroll to zoom
- **Hover**: validator tooltips showing name, provider, shard, rating, stake
- **Click**: zoom to a validator's cluster
- **"i" button**: toggle shard labels, node counts, and sampled transaction feed
- **Sound button**: toggle ambient soundtrack
- Auto-orbiting camera resumes after 15 seconds of inactivity

## Tech Stack

- Three.js r183 + custom GLSL shaders
- Vite + TypeScript (vanilla, no framework)
- 80,000 background stars, 3,000 ambient dust particles
- 800-slot transaction particle pool with object recycling

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # Production build to dist/
```

## Architecture

```
src/
  scene/          # Three.js visual systems (Galaxy, ValidatorField, MetachainCore, Starfield, DustField)
  shaders/        # Custom GLSL (star glow, particle, metachain Fresnel, post-processing)
  particles/      # Transaction particle pool
  data/           # Mock data generator, simulation engine, DataSource interface
  interaction/    # Camera, raycaster, HUD, info overlay, audio, tooltip
  utils/          # Config, colors, math helpers
```

The `DataSource` interface (`src/data/DataSource.ts`) defines the abstraction for swapping mock data with live MultiversX API feeds.

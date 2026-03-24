# Galaxy of Nodes — Content Brief for Social Launch

## For: Twitter thread + LinkedIn post introducing the visualization
## Live URL: https://galaxy-of-nodes.vercel.app
## Live data version: https://galaxy-of-nodes.vercel.app/?data=live

---

## THE WHY — Background & Motivation

### The problem we're solving

MultiversX is one of the most technically ambitious blockchain architectures in existence. Adaptive state sharding splits the network into parallel processing lanes. 400 validators form consensus groups per shard. Cross-shard transactions execute seamlessly across boundaries. And with Supernova — the upcoming upgrade — consensus and execution decouple, enabling 600ms block times.

The problem: almost nobody can see any of this happening.

The network processes thousands of transactions per second across 3,200+ validator nodes organized into 3 shards plus a metachain. But to the outside world, this is just numbers on a dashboard. Block explorers show tables. Analytics dashboards show charts. None of them convey what it actually *feels* like to watch a high-performance sharded blockchain operate at scale.

### The vision

We wanted to make the network *visible* — not as a dashboard, not as a block explorer, but as a living thing you can watch breathe.

The core metaphor: the MultiversX network as a galaxy. Every shard is a star cluster. Every validator is a star. Every transaction is a photon of light traveling through space. Cross-shard transactions arc between clusters. The metachain pulses at the center like a gravitational core.

The emotional target: you open this page and you're floating in space, watching a civilization's financial nervous system fire in real time. The same feeling as the first time you saw Google's "100,000 Stars" experiment — that mix of awe and comprehension. Except here, you're not looking at dead stars. You're watching a living network think.

**One line: Transaction flow as cosmic choreography.**

### What this is NOT

- Not a dashboard (no charts, no tables)
- Not a block explorer (no address lookups, no transaction details)
- Not "crypto art" (no neon gradients, no skeuomorphic chain links)
- Not something you need to read to understand — you *see* it

### Inspiration sources worth mentioning

- Google's "100,000 Stars" Chrome experiment (depth of field, zoom levels, the way you feel small looking at it)
- The concept that blockchain infrastructure can be art, not just analytics
- The Supernova upgrade's unique architecture as a visual story opportunity

---

## THE WHAT — What People Are Actually Seeing

### The galaxy structure

**3 shard clusters + 1 metachain core = the galaxy**

The visualization maps real MultiversX network topology to celestial bodies:

| What you see | What it actually is |
|---|---|
| The bright white core at center | The **metachain** — MultiversX's coordination layer that notarizes cross-shard activity and maintains network consensus |
| The warm amber/gold star cluster | **Shard 0** — one of three parallel processing shards |
| The cool teal star cluster | **Shard 1** |
| The deep coral/pink star cluster | **Shard 2** |
| Each individual star point | A **validator node** — one of ~3,200 nodes securing the network |
| Star brightness | The validator's **rating** (0-100) — how reliably it participates in consensus. High-rated validators glow brighter. |
| Star size | The validator's **stake** — how much EGLD is staked on that node. More stake = larger star. |
| Particles flying within a cluster | **Intra-shard transactions** — transfers, smart contract calls, and token operations happening within a single shard |
| Particles flying between clusters | **Cross-shard transactions** — the most technically impressive part of MultiversX's architecture, where a transaction originates in one shard and executes in another, with the metachain notarizing the handoff |
| The pulsing/flaring on a star | That validator just **proposed a block** — it was selected as the consensus leader for that round. A ring of light expands outward from the star for ~400ms. |
| The TPS bar at the bottom | Real-time **transactions per second** across the entire network. The gradient shifts from amber to teal to coral. |
| Particle color: warm gold | **EGLD transfer** (simple value transfer) |
| Particle color: bright cyan | **Smart contract call** (interacting with a dApp) |
| Particle color: vivid purple | **ESDT token transfer** (custom tokens like USDC, MEX, etc.) |
| Particle color: bright white | **Cross-shard transaction** (overrides type color — the journey matters more than the type) |
| Bigger, brighter particle | **Higher-value transaction** — logarithmic scale, so a 1,000 EGLD transfer is visually larger and brighter than a 1 EGLD one |
| Particle with trailing particles (comet) | **High-value cross-shard transaction** — when value is significant AND the tx crosses shard boundaries, it gets 2 trailing particles creating a comet effect |
| Particle moving fast within a cluster | **Intra-shard transaction** — lifetime 0.6 seconds, short straight path |
| Particle arcing slowly between clusters | **Cross-shard transaction** — lifetime 2.0 seconds, subtle Bezier curve routing near the metachain |
| Stars have faint cross-shaped spikes | **Diffraction spikes** — only visible on large, bright stars (high stake + high rating). The "spike" effect makes important validators look like real telescope star images. |
| Stars shift whiter | **High-rated validators** (above 70 rating) shift color toward white-hot — up to 40% white blend at perfect rating |
| Each shard cluster dims and brightens slowly | **Cluster breathing** — each shard oscillates brightness at its own frequency (2.5–4 second periods), creating an organic "alive" feel. Shards never breathe in sync. |
| All clusters pulse simultaneously + particle flood | **Supernova burst** (mock mode) — every ~30 seconds, 5,000 transactions flood all shards simultaneously. Proposer flares fire in all shards at once. This simulates the post-Supernova upgrade high-throughput behavior. |
| The bright core grows slightly and glows | **Metachain pulse** — when a metachain block is produced, the core emits a visible pulse (scale boost + light intensity increase), decaying over ~400ms |
| Each cluster rotates very slowly | **Cluster rotation** — validators orbit their cluster center at 0.02 rad/s (one full orbit every ~5 minutes). Subtle enough to feel organic, not mechanical. |
| Star brightness shimmers rapidly | **Star twinkle** — multi-frequency sine wave animation (3 overlapping waves at different speeds) creates natural-looking shimmer unique to each star |
| Very faint colored dust drifts between clusters | **Ambient dust field** — 3,000 particles drifting at 0.05–0.2 units/second, tinted with desaturated shard colors. Creates a sense of atmosphere even at zero TPS. |

### How we compute the data

**Live mode (`?data=live`)** connects to the actual MultiversX API:

- **Validators**: Fetched from the network's node registry (~3,200 validators). Each node's BLS public key, shard assignment, rating, stake amount, provider name, and online status are mapped to star properties (position within its shard cluster, brightness, size).

- **Transactions**: Polled from the API every 6 seconds. Each transaction is classified by type (simple transfer, smart contract call, ESDT token transfer) and visualized as a particle traveling from sender's shard to receiver's shard. Cross-shard transactions route through the metachain region.

- **Blocks**: Each shard produces blocks independently. When a new block arrives, the proposer validator (the node that led consensus for that round) emits a visible pulse — a brief stellar flare.

- **Network stats**: TPS (transactions per second), total transaction count, current epoch, and round number are pulled from the stats endpoint and displayed on the HUD.

- **Shard assignment**: Validators are positioned in 3D space according to their shard. The clusters form organically — validators within a shard are near each other, creating the visual impression of gravitational territories.

**Mock mode (default)** simulates a network running at 1,000-10,000 TPS with realistic validator distributions matching the actual network's structure (718 metachain, 714/712/714 across shards 0-2, plus auction validators), complete with periodic "Supernova bursts" that flood all shards with 100+ transactions simultaneously.

### The rendering

- **3,200+ validator stars** rendered as GPU-accelerated instanced points with custom GLSL shaders for the soft stellar glow effect
- **80,000 background stars** for cosmic depth
- **3,000 ambient dust particles** drifting slowly between clusters
- **800-slot transaction particle pool** with object recycling for smooth performance
- **Cinematic post-processing**: bloom (stars glow), color grading, vignette, film grain, chromatic aberration — all running in real-time WebGL
- **Ambient soundtrack** (toggleable) for the full immersive experience

### Interactive elements

- **Orbit**: drag to rotate the galaxy, scroll to zoom
- **Hover a star**: tooltip shows the real validator's name, provider, shard, rating, stake
- **Click a star**: camera zooms to that validator's cluster
- **"i" button**: toggles shard labels, node counts, and a sampled transaction feed
- **Galaxy button** (bottom-left): hover/tap to reveal a legend explaining what everything means
- **Auto-orbit**: the camera slowly rotates on its own, resuming after 15 seconds of inactivity

---

## TECHNICAL DETAILS (for the builder/dev audience)

### Stack
- Three.js (r183) + custom GLSL shaders
- TypeScript, Vite, vanilla (no React/Vue)
- MultiversX public API for live data
- Deployed on Vercel

### Architecture pattern
The project uses a `DataSource` interface that abstracts mock vs. live data. Swapping between simulated and real network data is a URL parameter (`?data=live`). The mock system generates realistic transaction patterns; the live system polls the actual chain. Both feed into the same rendering pipeline.

### Open source
GitHub: https://github.com/user/galaxy-of-nodes (adjust URL)

---

## KEY TALKING POINTS FOR THE WRITING

### For Twitter thread (suggested arc)
1. **Hook**: "What does a blockchain look like when it's alive?" / Show the visual
2. **The problem**: Blockchains are invisible infrastructure. The most technically ambitious networks look the same as the simplest ones from the outside.
3. **The metaphor**: Every validator is a star. Every transaction is light. Every shard is a star cluster. The metachain is the gravitational core.
4. **The data is real**: This isn't generative art. Those 3,200 stars are real validator nodes. Those particles are real transactions. That TPS bar is real throughput.
5. **The technical flex**: MultiversX runs 3 parallel shards + metachain, each with ~720 validators, processing thousands of TPS with cross-shard execution. This is what that *looks* like.
6. **Try it yourself**: Link to live URL. Hover on a star. Click the "i" button. Watch the cross-shard arcs.
7. **What's next**: Live data integration with Battle of Nodes, Supernova-specific visualizations (consensus flash vs execution glow).

### For LinkedIn (suggested angle)
- More emphasis on the "why" — making complex infrastructure legible
- The gap between technical achievement and public perception in blockchain
- How visualization can be a communication tool, not just analytics
- The craft of mapping data to visual metaphors (validator rating → star brightness is a design decision, not an obvious one)
- Brief technical note on the stack for the dev audience

### Tone guidance
- Confident but not hype-y. Let the visual speak.
- Technical credibility without jargon overload
- "We built this because we wanted to see it" energy
- No price talk, no token shilling, no "bullish" language
- The awe should come from the engineering, not the marketing

### Suggested media assets
1. **Screen recording** (15-30s): slow orbit showing all 3 clusters + metachain, then zoom into one shard, hover a validator. GIF or MP4.
2. **Static screenshot**: the full galaxy view with all clusters visible, particles in flight
3. **Detail shot**: close-up of a shard cluster with transaction particles visible between stars
4. **Info overlay screenshot**: the "i" mode showing shard labels, node counts, transaction feed — proves it's real data
5. **Before/after**: a traditional block explorer table view vs. the galaxy view of the same network

### Hashtags / tags
- #MultiversX #WebGL #DataVisualization #ThreeJS #Blockchain
- Tag @MultiversX, @AurelienCR (if relevant), Three.js community accounts
- For LinkedIn: blockchain infrastructure, data visualization, WebGL, creative technology

---

## RAW QUOTES / LINES TO POTENTIALLY USE

- "MultiversX processes thousands of transactions per second across 3,200 validator nodes. We made it visible."
- "Not a dashboard. Not a block explorer. A living galaxy."
- "Every star is a real validator. Every particle is a real transaction. Every cluster is a real shard."
- "The metachain pulses at the center like a heart. Because that's what it is."
- "Cross-shard transactions arc between clusters like comets — because that's what cross-shard execution actually looks like when you can see it."
- "We wanted to feel the network breathe. So we built a cosmos."
- "Transaction flow as cosmic choreography."
- "The network is always alive. Even at low TPS, the galaxy shimmers."

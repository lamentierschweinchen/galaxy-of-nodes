// Validator star shaders — cinematic point sprites with multi-layer glow,
// multi-frequency twinkle, diffraction spikes, and proposer pulse ring.
// Adapted from supernova-experience star shaders.

export const starVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aProposerPulse;

  varying vec3 vColor;
  varying float vBrightness;
  varying float vSize;
  varying float vProposerPulse;

  uniform float uTime;
  uniform float uSizeMultiplier;

  void main() {
    vColor = aColor;
    vProposerPulse = aProposerPulse;

    // Multi-frequency twinkle for organic feel
    float twinkle1 = sin(uTime * 1.2 + aPhase * 6.2831);
    float twinkle2 = sin(uTime * 2.7 + aPhase * 3.1415 + 1.3);
    float twinkle3 = sin(uTime * 0.4 + aPhase * 9.42);
    float twinkle = 0.78 + 0.12 * twinkle1 + 0.06 * twinkle2 + 0.04 * twinkle3;

    // Proposer pulse boosts brightness
    vBrightness = aBrightness * twinkle + aProposerPulse * 0.8;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Perspective size attenuation
    float perspectiveScale = 300.0 / (-mvPosition.z);
    float finalSize = aSize * uSizeMultiplier * perspectiveScale;

    // Proposer pulse increases size
    finalSize *= (1.0 + aProposerPulse * 1.5);

    vSize = finalSize;
    gl_PointSize = clamp(finalSize, 0.5, 80.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const starFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;
  varying float vSize;
  varying float vProposerPulse;

  uniform float uTime;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    if (dist > 0.5) discard;

    // -- Multi-layer glow for cinematic stars --

    // Tight hot core
    float coreRadius = 0.05;
    float core = exp(-dist * dist / (coreRadius * coreRadius * 2.0));

    // Inner glow
    float innerGlowR = 0.12;
    float innerGlow = exp(-dist * dist / (innerGlowR * innerGlowR * 2.0));

    // Outer soft halo
    float haloR = 0.35;
    float halo = exp(-dist * dist / (haloR * haloR * 0.3));

    // Diffraction spikes for bright/large stars
    float spike = 0.0;
    if (vSize > 4.0 && vBrightness > 0.6) {
      float spikeStrength = smoothstep(4.0, 12.0, vSize) * 0.3;
      float ax = abs(center.x);
      float ay = abs(center.y);
      float spike1 = exp(-ay * ay * 800.0) * exp(-ax * 3.0);
      float spike2 = exp(-ax * ax * 800.0) * exp(-ay * 3.0);
      vec2 rot45 = vec2(center.x + center.y, center.x - center.y) * 0.7071;
      float spike3 = exp(-rot45.y * rot45.y * 1200.0) * exp(-abs(rot45.x) * 4.0) * 0.4;
      float spike4 = exp(-rot45.x * rot45.x * 1200.0) * exp(-abs(rot45.y) * 4.0) * 0.4;
      spike = (spike1 + spike2 + spike3 + spike4) * spikeStrength;
    }

    // Proposer pulse ring effect
    float ring = 0.0;
    if (vProposerPulse > 0.01) {
      float ringDist = abs(dist - 0.3);
      ring = exp(-ringDist * ringDist * 200.0) * vProposerPulse;
    }

    // Combine layers
    float alpha = core + innerGlow * 0.5 + halo * 0.2 + spike + ring;

    // Color: hot white core fading to the star's temperature color
    vec3 hotWhite = vec3(1.0, 0.98, 0.95);
    vec3 coreColor = mix(vColor, hotWhite, 0.85);
    vec3 innerColor = mix(vColor, hotWhite, 0.4);
    vec3 haloColor = vColor * 0.8;
    vec3 spikeColor = mix(vColor, hotWhite, 0.6);
    vec3 ringColor = vec3(1.0, 0.95, 0.9);

    vec3 finalColor = coreColor * core
                    + innerColor * innerGlow * 0.5
                    + haloColor * halo * 0.2
                    + spikeColor * spike
                    + ringColor * ring * 2.0;

    finalColor /= max(alpha, 0.001);
    finalColor *= vBrightness;

    gl_FragColor = vec4(finalColor, alpha * vBrightness);
  }
`;

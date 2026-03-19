// Simplified background star shader — core + halo only, no diffraction spikes.
// Optimized for 80k points with minimal GPU cost.

export const bgStarVertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aBrightness;
  attribute vec3 aColor;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vBrightness;

  uniform float uTime;

  void main() {
    vColor = aColor;

    // Gentle twinkle — single frequency for performance
    float twinkle = 0.85 + 0.15 * sin(uTime * 0.8 + aPhase * 6.2831);
    vBrightness = aBrightness * twinkle;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float perspectiveScale = 300.0 / (-mvPosition.z);
    float finalSize = aSize * perspectiveScale;

    gl_PointSize = clamp(finalSize, 0.3, 12.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const bgStarFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);

    if (dist > 0.5) discard;

    // Simple core + halo
    float core = exp(-dist * dist / 0.005);
    float halo = exp(-dist * dist / 0.04);

    float alpha = core + halo * 0.3;

    vec3 hotWhite = vec3(1.0, 0.98, 0.95);
    vec3 finalColor = mix(vColor, hotWhite, core * 0.6) * core
                    + vColor * halo * 0.3;

    finalColor /= max(alpha, 0.001);
    finalColor *= vBrightness;

    gl_FragColor = vec4(finalColor, alpha * vBrightness);
  }
`;

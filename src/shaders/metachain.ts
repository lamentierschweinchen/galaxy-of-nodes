// Metachain central orb shader — Fresnel rim glow with animated surface noise

export const metachainVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const metachainFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uPulse; // 0-1 pulse intensity

  // Simple 2D hash for noise
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // 2-octave FBM
  float fbm(vec2 p) {
    float v = 0.0;
    v += noise(p) * 0.5;
    v += noise(p * 2.1 + 0.5) * 0.25;
    return v;
  }

  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float NdotV = dot(viewDir, vNormal);
    float fresnel = 1.0 - abs(NdotV);

    // Animated surface ripple
    vec2 noiseCoord = vUv * 4.0 + vec2(uTime * 0.1, uTime * 0.07);
    float surfaceNoise = fbm(noiseCoord) * 0.3;

    // Soft radial gradient: hot center → transparent edges
    float coreBrightness = pow(max(NdotV, 0.0), 0.8);

    // Rim glow: soft blue-white at edges, fading to transparent
    vec3 coreColor = vec3(1.0, 0.98, 0.95);
    vec3 rimColor = vec3(0.6, 0.78, 1.0);

    vec3 baseColor = mix(rimColor, coreColor, coreBrightness);
    baseColor += surfaceNoise * 0.1;

    // Fresnel rim — soft atmospheric edge glow
    float rimGlow = pow(fresnel, 3.0) * 0.8;

    // Pulse modulation
    float pulse = 0.7 + uPulse * 0.5;

    // Alpha: soft falloff from center, rim glow adds atmosphere
    float alpha = (coreBrightness * 0.6 + rimGlow * 0.4) * pulse;

    vec3 finalColor = baseColor * coreBrightness * pulse;
    // Atmospheric rim
    finalColor += rimColor * rimGlow * 0.6;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

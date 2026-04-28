varying float vNoise;
varying vec3 vWorldPos;
varying float vLevel;

attribute float aNoise;

uniform float uThresh1;
uniform float uThresh2;
uniform float uThresh3;

/** Local-space step amplitude on unit sphere (scaled by mesh world radius in TS). */
uniform float uStepHeight;
uniform float uStepSmoothness;

void main() {
  vNoise = aNoise;
  float n = aNoise;

  float level = 0.0;
  float sm = uStepSmoothness;
  level += smoothstep(uThresh1 - sm, uThresh1 + sm, n);
  level += smoothstep(uThresh2 - sm, uThresh2 + sm, n);
  level += smoothstep(uThresh3 - sm, uThresh3 + sm, n);
  vLevel = level;

  vec3 displaced = position + normal * (level * uStepHeight);

  vec4 worldPos4 = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos4.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos4;
}

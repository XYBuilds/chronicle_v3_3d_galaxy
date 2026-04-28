varying float vNoise;
varying vec3 vWorldPos;
varying float vLevel;

attribute float aNoise;

/** Between-band cuts (length = uCutCount); unused entries padded to 2.0 on CPU. */
uniform float uThresh[7];

uniform float uCutCount;

/** Local-space step amplitude between adjacent genre bands on unit sphere. */
uniform float uStepHeight;
uniform float uStepSmoothness;

void main() {
  vNoise = aNoise;
  float n = aNoise;

  float level = 0.0;
  float sm = uStepSmoothness;
  level += step(0.5, uCutCount) * smoothstep(uThresh[0] - sm, uThresh[0] + sm, n);
  level += step(1.5, uCutCount) * smoothstep(uThresh[1] - sm, uThresh[1] + sm, n);
  level += step(2.5, uCutCount) * smoothstep(uThresh[2] - sm, uThresh[2] + sm, n);
  level += step(3.5, uCutCount) * smoothstep(uThresh[3] - sm, uThresh[3] + sm, n);
  level += step(4.5, uCutCount) * smoothstep(uThresh[4] - sm, uThresh[4] + sm, n);
  level += step(5.5, uCutCount) * smoothstep(uThresh[5] - sm, uThresh[5] + sm, n);
  level += step(6.5, uCutCount) * smoothstep(uThresh[6] - sm, uThresh[6] + sm, n);
  vLevel = level;

  vec3 displaced = position + normal * (level * uStepHeight);

  vec4 worldPos4 = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPos4.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos4;
}

uniform float uPixelRatio;

attribute float size;
attribute vec3 color;
attribute float emissive;

varying vec3 vColor;
varying float vEmissive;

void main() {
  vColor = color;
  vEmissive = emissive;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float dist = max(0.001, -mvPosition.z);
  float px = size * uPixelRatio * (500.0 / dist);
  gl_PointSize = clamp(px, 1.0, 256.0);
}

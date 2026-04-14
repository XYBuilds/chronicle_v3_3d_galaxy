uniform float uPixelRatio;
uniform float uSizeScale;

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
  float px = size * uPixelRatio * (500.0 / dist) * uSizeScale;
  // No shader clamp — perspective size follows 1/dist; GPU may still enforce its own gl_PointSize max.
  gl_PointSize = px;
}

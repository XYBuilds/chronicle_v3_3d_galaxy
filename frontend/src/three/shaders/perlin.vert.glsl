varying vec3 vObjPos;
varying vec3 vNormal;
/** P8.3 — vertex noise from CPU (sorted-quantile bands). */
varying float vNoise;

attribute float aNoise;

void main() {
  vNoise = aNoise;
  vObjPos = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

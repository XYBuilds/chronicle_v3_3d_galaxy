import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { subsampleMovieMarthasVineyard } from '@/storybook/fixtures/subsampleMovies'

import { pickClosestActiveMovieAlongRay } from './screenRadius'

function activeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: 1 },
      uActiveSizeMul: { value: 1 },
      uIdleNearFadeEnabled: { value: 0 },
      uIdleZFadeMode: { value: 0 },
    },
  })
}

describe('active movie ray picking', () => {
  it('does not fall back to timeline picking for an authoritative empty mask', () => {
    const movie = { ...subsampleMovieMarthasVineyard, x: 0, y: 0, z: 2020 }
    const picked = pickClosestActiveMovieAlongRay({
      ray: new THREE.Ray(
        new THREE.Vector3(0, 0, 2010),
        new THREE.Vector3(0, 0, 1),
      ),
      movies: [movie],
      activeMaterial: activeMaterial(),
      zCurrent: 2020,
      zVisWindow: 1,
      requireSlabInteraction: false,
      selectionMaskPickSet: new Set(),
      cameraWorldPos: new THREE.Vector3(0, 0, 2010),
      idleNearFadeExemptMovieId: null,
    })

    expect(picked).toBeNull()
  })
})
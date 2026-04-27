import { useControls, Leva } from 'leva'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { GalaxyThreeLayerLabCore, type GalaxyThreeLayerLabProps } from './GalaxyThreeLayerLabCore'

const NONE = '__none__'

function selectedToLeva(id: number | null): string {
  return id == null ? NONE : String(id)
}

function levaToSelected(s: string): number | null {
  return s === NONE ? null : Number(s)
}

type LevaSet = (values: Record<string, unknown>) => void

/**
 * Dev-only (imported only under `import.meta.env.DEV`): Leva panel for P7.3 I2 tuning in Storybook / Vite dev.
 */
export function GalaxyThreeLayerLabLevaHost(props: GalaxyThreeLayerLabProps) {
  const zLo = Math.min(props.meta.z_range[0]!, props.meta.z_range[1]!)
  const zHi = Math.max(props.meta.z_range[0]!, props.meta.z_range[1]!)

  const selectOptions = useMemo(() => {
    const opts: string[] = [NONE]
    for (const m of props.movies) opts.push(String(m.id))
    return opts
  }, [props.movies])

  const [v, set] = useControls(
    'Galaxy · I2 (P7.3)',
    () => ({
      zCurrent: { value: props.zCurrent, label: '宏观 · zCurrent', min: zLo, max: zHi, step: 0.02 },
      zVisWindow: { value: props.zVisWindow, label: '宏观 · zVisWindow', min: 0.05, max: 8, step: 0.05 },
      uFocusSizeMul: { value: props.uFocusSizeMul, label: '宏观 · uFocusSizeMul', min: 0.01, max: 2, step: 0.01 },
      uBgSizeMul: { value: props.uBgSizeMul, label: '宏观 · uBgSizeMul', min: 0.0001, max: 1.5, step: 0.0001 },
      uLMin: { value: props.uLMin, label: '宏观 · uLMin', min: 0.05, max: 0.6, step: 0.01 },
      uLMax: { value: props.uLMax, label: '宏观 · uLMax', min: 0.4, max: 0.99, step: 0.01 },
      uChroma: { value: props.uChroma, label: '宏观 · uChroma', min: 0.02, max: 0.35, step: 0.01 },
      uSizeScale: { value: props.uSizeScale, label: '宏观 · uSizeScale', min: 0.05, max: 1.2, step: 0.01 },
      postProcessBloom: { value: props.postProcessBloom, label: 'Bloom · enabled' },
      bloomStrength: { value: props.bloomStrength, label: 'Bloom · strength', min: 0, max: 2.5, step: 0.02 },
      bloomRadius: { value: props.bloomRadius, label: 'Bloom · radius', min: 0, max: 1.5, step: 0.01 },
      bloomThreshold: { value: props.bloomThreshold, label: 'Bloom · threshold', min: 0, max: 1, step: 0.01 },
      selectedMovieId: {
        value: selectedToLeva(props.selectedMovieId),
        label: 'Perlin · selectedMovieId',
        options: selectOptions,
      },
      planetUScale: { value: props.planetUScale, label: 'Perlin · uScale', min: 0.5, max: 6, step: 0.05 },
      planetOctaves: { value: props.planetOctaves, label: 'Perlin · octaves', min: 1, max: 8, step: 1 },
      planetPersistence: {
        value: props.planetPersistence,
        label: 'Perlin · persistence',
        min: 0.08,
        max: 0.98,
        step: 0.01,
      },
      planetAreaRatio: {
        value: props.planetAreaRatio,
        label: 'Perlin · uAreaRatio (1,x,x²,x³)',
        min: 0.15,
        max: 1.2,
        step: 0.005,
      },
    }),
    { collapsed: false },
    [zLo, zHi, selectOptions],
  )

  const setRef = useRef<LevaSet | null>(null)
  useLayoutEffect(() => {
    setRef.current = set
  })

  useEffect(() => {
    setRef.current?.({
      zCurrent: props.zCurrent,
      zVisWindow: props.zVisWindow,
      uFocusSizeMul: props.uFocusSizeMul,
      uBgSizeMul: props.uBgSizeMul,
      uLMin: props.uLMin,
      uLMax: props.uLMax,
      uChroma: props.uChroma,
      uSizeScale: props.uSizeScale,
      postProcessBloom: props.postProcessBloom,
      bloomStrength: props.bloomStrength,
      bloomRadius: props.bloomRadius,
      bloomThreshold: props.bloomThreshold,
      selectedMovieId: selectedToLeva(props.selectedMovieId),
      planetUScale: props.planetUScale,
      planetOctaves: props.planetOctaves,
      planetPersistence: props.planetPersistence,
      planetAreaRatio: props.planetAreaRatio,
    })
  }, [
    props.zCurrent,
    props.zVisWindow,
    props.uFocusSizeMul,
    props.uBgSizeMul,
    props.uLMin,
    props.uLMax,
    props.uChroma,
    props.uSizeScale,
    props.postProcessBloom,
    props.bloomStrength,
    props.bloomRadius,
    props.bloomThreshold,
    props.selectedMovieId,
    props.planetUScale,
    props.planetOctaves,
    props.planetPersistence,
    props.planetAreaRatio,
  ])

  const merged: GalaxyThreeLayerLabProps = {
    ...props,
    zCurrent: v.zCurrent,
    zVisWindow: v.zVisWindow,
    uFocusSizeMul: v.uFocusSizeMul,
    uBgSizeMul: v.uBgSizeMul,
    uLMin: v.uLMin,
    uLMax: v.uLMax,
    uChroma: v.uChroma,
    uSizeScale: v.uSizeScale,
    postProcessBloom: v.postProcessBloom,
    bloomStrength: v.bloomStrength,
    bloomRadius: v.bloomRadius,
    bloomThreshold: v.bloomThreshold,
    selectedMovieId: levaToSelected(v.selectedMovieId),
    planetUScale: v.planetUScale,
    planetOctaves: Math.round(v.planetOctaves),
    planetPersistence: v.planetPersistence,
    planetAreaRatio: v.planetAreaRatio,
  }

  return (
    <div className="relative h-full w-full">
      <Leva fill flat titleBar={{ title: 'Chronicle · I2', drag: true }} />
      <GalaxyThreeLayerLabCore {...merged} />
    </div>
  )
}

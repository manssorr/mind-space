export interface BackgroundPreset {
  id: string
  name: string
  light: string
  dark: string
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: "default", name: "Default", light: "hsl(0 0% 100%)", dark: "hsl(0 0% 3.9%)" },
  { id: "slate", name: "Slate", light: "hsl(215 25% 95%)", dark: "hsl(215 25% 10%)" },
  { id: "sand", name: "Warm Sand", light: "hsl(38 35% 93%)", dark: "hsl(30 20% 11%)" },
  { id: "forest", name: "Forest", light: "hsl(140 25% 93%)", dark: "hsl(145 20% 10%)" },
  { id: "ocean", name: "Ocean", light: "hsl(200 35% 93%)", dark: "hsl(205 30% 10%)" },
  { id: "plum", name: "Plum", light: "hsl(280 25% 94%)", dark: "hsl(280 20% 11%)" },
]

const DEFAULT_PRESET = BACKGROUND_PRESETS[0]

export function resolveBackgroundColor(presetId: string, isDark: boolean): string {
  const preset = BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET
  return isDark ? preset.dark : preset.light
}

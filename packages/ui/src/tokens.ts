/**
 * Design tokens for the "Linear" look mandated by the XER-71 plan:
 * near-black / crisp-white surfaces, one restrained indigo-violet accent,
 * hairline borders, generous whitespace, Inter for text with JetBrains Mono
 * for identifiers/keys, dense ultra-legible type, and 120-180ms motion.
 *
 * This is the single source of truth for the token graph. The CSS custom
 * properties in `tokens.css` are generated from the same values (kept in
 * sync by convention — edit both together).
 */

export interface ColorScale {
  25: string
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  950: string
}

/** Neutral (gray) ramp used for surfaces, hairline borders and legible text. */
export interface NeutralScale {
  0: string
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  950: string
}

export interface SemanticTokens {
  success: string
  onSuccess: string
  warning: string
  onWarning: string
  danger: string
  onDanger: string
  /** Accent-derived, for selected rows / active nav. */
  info: string
}

/**
 * Everything that is theme-dependent lives here. Light = crisp off-white,
 * dark = near-black. Both share the same hairline-border density.
 */
export interface ThemeSurface {
  /** Page background. */
  background: string
  /** Raised panel / card surface. */
  surface: string
  /** Surface on hover (list rows, table rows). */
  surfaceHover: string
  /** Surface when actively pressed / selected. */
  surfaceActive: string
  /** Overlay layer above surfaces (menus, popovers). */
  surfaceRaised: string
  /** Hairline border (1px). */
  border: string
  /** Stronger hairline for inputs / focus framing. */
  borderStrong: string
  borderHover: string
  /** Primary text. */
  text: string
  /** Secondary / muted text. */
  textMuted: string
  /** Tertiary / faint text (placeholders, disabled). */
  textFaint: string
  /** Text on accent-fills (primary buttons). */
  textInverse: string
  /** Backdrop scrim behind modal/dialog. */
  overlay: string
  /** Text selection background. */
  selection: string
}

export interface TypographyTokens {
  fontFamily: string
  fontMono: string
  /** x-height / legibility size scale in rem. */
  sizes: {
    xs: { size: string; lineHeight: string }
    sm: { size: string; lineHeight: string }
    md: { size: string; lineHeight: string }
    lg: { size: string; lineHeight: string }
    xl: { size: string; lineHeight: string }
    '2xl': { size: string; lineHeight: string }
  }
  weights: { regular: number; medium: number; semibold: number; bold: number }
  letterSpacing: { tight: string; normal: string; wide: string }
}

export interface ElevationTokens {
  /** Flush — hairline border only, near-zero shadow. */
  0: string
  /** Raised — popovers, dropdowns, command palette. */
  1: string
  /** Highest — modals/dialogs. */
  2: string
}

export interface MotionTokens {
  /** Fastest state change — the Linear floor (120ms). */
  fast: number
  /** Default transitions (150ms). */
  base: number
  /** Slowest allowed, still snappy (180ms). */
  slow: number
  easeIn: string
  easeOut: string
  easeInOut: string
}

export interface ZIndexTokens {
  base: number
  dropdown: number
  sticky: number
  overlay: number
  modal: number
  popover: number
  toast: number
  tooltip: number
}

export interface BreakpointTokens {
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
}

export interface RadiusTokens {
  none: number
  sm: number
  md: number
  lg: number
  full: number
}

export interface SpacingTokens {
  1: number
  2: number
  3: number
  4: number
  5: number
  6: number
  8: number
  10: number
  12: number
  16: number
  20: number
  24: number
  32: number
  40: number
  48: number
  64: number
  80: number
  96: number
}

export interface ThemeTokens {
  accent: ColorScale
  neutral: NeutralScale
  semantic: SemanticTokens
  light: ThemeSurface
  dark: ThemeSurface
  typography: TypographyTokens
  elevation: { light: ElevationTokens; dark: ElevationTokens }
  motion: MotionTokens
  zIndex: ZIndexTokens
  borderRadius: RadiusTokens
  spacing: SpacingTokens
  breakpoints: BreakpointTokens
  /** Duration (ms) of the focus ring fade-in. */
  focus: { ringWidth: number; offset: number; duration: number }
}

export const accent: ColorScale = {
  25: '#f5f6ff',
  50: '#eef0ff',
  100: '#e0e4ff',
  200: '#c7cdff',
  300: '#a5abfb',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b66',
}

export const neutral: NeutralScale = {
  0: '#ffffff',
  50: '#fafafa',
  100: '#f4f4f5',
  200: '#e4e4e7',
  300: '#d4d4d8',
  400: '#a1a1aa',
  500: '#71717a',
  600: '#52525b',
  700: '#3f3f46',
  800: '#27272a',
  900: '#18181b',
  950: '#09090b',
}

export const semantic: SemanticTokens = {
  success: '#22c55e',
  onSuccess: '#ffffff',
  warning: '#f59e0b',
  onWarning: '#1c1917',
  danger: '#ef4444',
  onDanger: '#ffffff',
  info: '#6366f1',
}

export const light: ThemeSurface = {
  background: '#fafafa',
  surface: '#ffffff',
  surfaceHover: '#f4f4f5',
  surfaceActive: '#eceae9',
  surfaceRaised: '#ffffff',
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  borderHover: '#c4c4c8',
  text: '#18181b',
  textMuted: '#71717a',
  textFaint: '#a1a1aa',
  textInverse: '#ffffff',
  overlay: 'rgba(24, 24, 27, 0.45)',
  selection: 'rgba(99, 102, 241, 0.20)',
}

export const dark: ThemeSurface = {
  background: '#0a0a0b',
  surface: '#18181b',
  surfaceHover: '#1f1f22',
  surfaceActive: '#26262a',
  surfaceRaised: '#222225',
  border: '#26262a',
  borderStrong: '#333338',
  borderHover: '#414146',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textFaint: '#71717a',
  textInverse: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.6)',
  selection: 'rgba(99, 102, 241, 0.35)',
}

export const typography: TypographyTokens = {
  fontFamily:
    "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono:
    "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  sizes: {
    xs: { size: '0.75rem', lineHeight: '1rem' }, // 12/16
    sm: { size: '0.8125rem', lineHeight: '1.25rem' }, // 13/20
    md: { size: '0.875rem', lineHeight: '1.25rem' }, // 14/20
    lg: { size: '1rem', lineHeight: '1.5rem' }, // 16/24
    xl: { size: '1.25rem', lineHeight: '1.75rem' }, // 20/28
    '2xl': { size: '1.5rem', lineHeight: '2rem' }, // 24/32
  },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  letterSpacing: { tight: '-0.011em', normal: '0em', wide: '0.02em' },
}

export const elevation = {
  light: {
    0: '0 1px 2px rgba(9, 9, 11, 0.04)',
    1: '0 1px 3px rgba(9, 9, 11, 0.06), 0 4px 16px rgba(9, 9, 11, 0.08)',
    2: '0 2px 6px rgba(9, 9, 11, 0.08), 0 12px 40px rgba(9, 9, 11, 0.14)',
  } satisfies ElevationTokens,
  dark: {
    0: '0 0 0 1px rgba(255, 255, 255, 0.03)',
    1: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 4px 20px rgba(0, 0, 0, 0.5)',
    2: '0 0 0 1px rgba(255, 255, 255, 0.05), 0 8px 40px rgba(0, 0, 0, 0.6)',
  } satisfies ElevationTokens,
} as const satisfies { light: ElevationTokens; dark: ElevationTokens }

export const motion: MotionTokens = {
  fast: 120,
  base: 150,
  slow: 180,
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.32, 0.72, 0, 1)',
}

export const zIndex: ZIndexTokens = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
}

export const borderRadius: RadiusTokens = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
}

export const spacing: SpacingTokens = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
  40: 160,
  48: 192,
  64: 256,
  80: 320,
  96: 384,
}

export const breakpoints: BreakpointTokens = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
}

export const focus = {
  ringWidth: 2,
  offset: 2,
  duration: 120,
}

export const tokens: ThemeTokens = {
  accent,
  neutral,
  semantic,
  light,
  dark,
  typography,
  elevation,
  motion,
  zIndex,
  borderRadius,
  spacing,
  breakpoints,
  focus,
}

/** Resolve an accent shade for a user-id-derived avatar (stable hue). */
export function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const shades = Object.values(tokens.accent)
  return shades[Math.abs(hash) % shades.length] ?? tokens.accent[500]
}

/** Resolve a deterministically-graded shade given a seed string. */
export function shadeFromSeed(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const shades = [
    tokens.accent[300],
    tokens.accent[400],
    tokens.accent[500],
    tokens.accent[600],
    tokens.accent[700],
    tokens.semantic.success,
    tokens.semantic.info,
  ]
  return shades[Math.abs(hash) % shades.length] ?? tokens.accent[500]
}

/** Duration in ms, clamped to the Linear 120–180ms band. */
export function preferMotion(preferred: number): number {
  return Math.min(tokens.motion.slow, Math.max(tokens.motion.fast, preferred))
}

/**
 * Colors taken from the church emblem (assets/logo-original.jpg): the blue disc and the gold crown.
 * Red stays darker than the emblem's pure red cross so warning text is readable on white.
 * Used by the app (src/ui/kit) and the receipt/report PDFs (src/core/templates/html).
 */
export const COLORS = {
  blue: '#004f90',
  blueSoft: '#e5eef7',
  gold: '#c99f35',
  /** Crown gold darkened so small print stays readable on white. */
  goldText: '#86650f',
  red: '#c8212a',
  redSoft: '#fdecec',
  green: '#1f7a3e',
  greenSoft: '#e6f4ea',
  amberSoft: '#fff4dc',
  amberText: '#8a5a00',
  ink: '#1a2433',
  muted: '#5d6b7a',
  line: '#d6dde5',
  bg: '#f4f7fa',
  /** Inactive cells and chips (months before a member started, months already paid). */
  disabled: '#eef2f6',
  disabledText: '#9aa7b4',
  placeholder: '#7d8b99',
  white: '#ffffff',
} as const;

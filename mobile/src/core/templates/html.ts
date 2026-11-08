import { COLORS } from '../brand';

export function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const usd = (n: number) => `$${n.toFixed(2)}`;

/** PDF colors: the same emblem palette as the app (core/brand). */
export const BRAND = {
  blue: COLORS.blue,
  gold: COLORS.gold,
  goldText: COLORS.goldText,
  red: COLORS.red,
  ink: COLORS.ink,
  muted: COLORS.muted,
  line: COLORS.line,
};

export const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Roboto, "Segoe UI", Helvetica, Arial, sans-serif; color: ${BRAND.ink}; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid ${BRAND.gold}; padding-bottom: 10px; }
  .head img { width: 64px; height: 64px; }
  .org1 { font-weight: 800; color: ${BRAND.muted}; font-size: 11px; letter-spacing: .8px; }
  .org2 { font-weight: 800; color: ${BRAND.blue}; font-size: 15px; }
  .org3 { font-weight: 700; color: ${BRAND.goldText}; font-size: 11px; }
  h1 { font-size: 16px; margin: 14px 0 6px; color: ${BRAND.blue}; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 5px 4px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${BRAND.muted}; border-bottom: 1px solid ${BRAND.line}; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: ${BRAND.muted}; }
  .foot { margin-top: 14px; font-size: 9.5px; color: ${BRAND.muted}; border-top: 1px solid ${BRAND.line}; padding-top: 6px; }
`;

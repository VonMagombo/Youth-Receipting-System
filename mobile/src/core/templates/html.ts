export function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const usd = (n: number) => `$${n.toFixed(2)}`;

export const BRAND = {
  navy: '#1d1b5e',
  gold: '#c99a2e',
  red: '#d7262e',
  ink: '#1a1a2e',
  muted: '#5b5b70',
  line: '#d9d9e3',
};

export const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Roboto, "Segoe UI", Helvetica, Arial, sans-serif; color: ${BRAND.ink}; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid ${BRAND.navy}; padding-bottom: 10px; }
  .head img { width: 64px; height: 64px; }
  .org1 { font-weight: 800; color: ${BRAND.navy}; font-size: 15px; letter-spacing: .3px; }
  .org2 { font-weight: 600; color: ${BRAND.navy}; font-size: 12px; }
  .org3 { color: ${BRAND.muted}; font-size: 11px; }
  h1 { font-size: 16px; margin: 14px 0 6px; color: ${BRAND.navy}; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 5px 4px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .5px; color: ${BRAND.muted}; border-bottom: 1px solid ${BRAND.line}; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: ${BRAND.muted}; }
  .foot { margin-top: 14px; font-size: 9.5px; color: ${BRAND.muted}; border-top: 1px solid ${BRAND.line}; padding-top: 6px; }
`;

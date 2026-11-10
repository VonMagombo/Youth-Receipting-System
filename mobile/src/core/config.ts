export const ORG = {
  church: 'AFM in Zimbabwe',
  assembly: 'El-Shaddai Christian Center Assembly',
  department: 'Youth Department',
  subscriptionUsd: 1,
} as const;

/** Receipt series used for payments brought in from the paper book. */
export const IMPORT_PREFIX = 'H';

/** Collector device prefixes. One letter so receipt numbers stay short. */
export const DEVICE_PREFIXES = [
  { prefix: 'T', label: 'Treasurer' },
  { prefix: 'S', label: 'Secretary' },
] as const;

/**
 * The live receipt verification page (Firebase project `elshaddai-youth`, see docs/PLAN.md). Every
 * receipt's QR code points here unless the phone has been given another address in Settings.
 */
export const DEFAULT_VERIFY_URL = 'https://elshaddai-youth.web.app/';

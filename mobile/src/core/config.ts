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

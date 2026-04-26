export const formatMXN = (cents: number): string =>
  `$${(cents / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

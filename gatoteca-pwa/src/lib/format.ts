export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 MB';
  }

  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) {
    return `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
  }

  const mb = bytes / 1024 / 1024;
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} MB`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

export function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

const LIMIT_KEY = 'gatoteca.storageLimitBytes';
const LIBRARY_URL_KEY = 'gatoteca.libraryUrl';

export const DEFAULT_LIBRARY_URL = 'https://example.com/gatoteca/videos.json';
export const DEFAULT_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;

export const STORAGE_LIMIT_OPTIONS = [
  { label: '2 GB', value: 2 * 1024 * 1024 * 1024 },
  { label: '5 GB', value: 5 * 1024 * 1024 * 1024 },
  { label: '10 GB', value: 10 * 1024 * 1024 * 1024 },
  { label: '20 GB', value: 20 * 1024 * 1024 * 1024 }
] as const;

export function getStorageLimit(): number {
  const saved = Number(localStorage.getItem(LIMIT_KEY));
  return Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_LIMIT_BYTES;
}

export function saveStorageLimit(bytes: number): void {
  localStorage.setItem(LIMIT_KEY, String(bytes));
}

export function getLibraryUrl(): string {
  return localStorage.getItem(LIBRARY_URL_KEY) || DEFAULT_LIBRARY_URL;
}

export function saveLibraryUrl(url: string): void {
  localStorage.setItem(LIBRARY_URL_KEY, url.trim() || DEFAULT_LIBRARY_URL);
}

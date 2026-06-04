export interface VideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  sizeBytes: number;
  priority?: number;
}

export interface StoredVideo {
  id: string;
  title: string;
  url: string;
  sizeBytes: number;
  downloadedAt: string;
  blob: Blob;
}

export interface DownloadFailure {
  id: string;
  title: string;
  message: string;
}

export interface DownloadReport {
  succeeded: number;
  failed: DownloadFailure[];
  cancelled: boolean;
  usedBytes: number;
  copiesCreated?: number;
  initialEstimatedBytes?: number | null;
  stopReason?: 'quota' | 'cancelled' | 'finished';
}

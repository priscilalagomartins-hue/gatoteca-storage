export const STORAGE_SAFETY_MARGIN_BYTES = 100 * 1024 * 1024;

export type StorageEstimateSnapshot = {
  quotaBytes: null | number;
  usageBytes: null | number;
  availableBytes: null | number;
  remainingBytes: null | number;
  supported: boolean;
};

export async function readStorageEstimate(): Promise<StorageEstimateSnapshot> {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
    return {
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
      remainingBytes: null,
      supported: false
    };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quotaBytes = estimate.quota || 0;
    const usageBytes = estimate.usage || 0;
    const availableBytes = Math.max(quotaBytes - usageBytes, 0);
    const remainingBytes = Math.max(availableBytes - STORAGE_SAFETY_MARGIN_BYTES, 0);

    return {
      quotaBytes,
      usageBytes,
      availableBytes,
      remainingBytes,
      supported: true
    };
  } catch {
    return {
      quotaBytes: null,
      usageBytes: null,
      availableBytes: null,
      remainingBytes: null,
      supported: false
    };
  }
}

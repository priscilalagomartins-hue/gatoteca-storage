export const STORAGE_SAFETY_MARGIN_BYTES = 500 * 1024 * 1024;

export type StorageEstimateSnapshot = {
  quotaBytes: null | number;
  usageBytes: null | number;
  availableBytes: null | number;
  remainingBytes: null | number;
  supported: boolean;
};

export async function readStorageEstimate(gatotecaUsageBytes: number): Promise<StorageEstimateSnapshot> {
  void gatotecaUsageBytes;

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
    const quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
    const usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;

    if (quotaBytes === null || usageBytes === null) {
      return {
        quotaBytes,
        usageBytes,
        availableBytes: null,
        remainingBytes: null,
        supported: true
      };
    }

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

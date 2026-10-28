// P7: policy riêng cho ảnh chuyên khoa; avatar/bài viết chưa có consumer.
export const SPECIALTY_IMAGE_POLICY = Object.freeze({
  inputBytes: 10 * 1024 * 1024,
  outputBytes: 2 * 1024 * 1024,
  maxPixels: 25_000_000,
  qualities: [85, 80] as const,
  resizeRatio: 0.85,
  resizeSteps: 6,
  minLongEdge: 1600,
  processingMs: 15_000,
  providerMs: 20_000,
  requestMs: 45_000,
  concurrent: 2,
  pendingMs: 24 * 60 * 60 * 1000,
  cleanupBatch: 50,
  cleanupLeaseMs: 5 * 60 * 1000,
  maxDeleteAttempts: 5,
});

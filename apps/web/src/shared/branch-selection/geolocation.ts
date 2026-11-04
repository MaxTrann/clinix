import type { Coordinates } from './nearest-branch';

// Chờ vị trí tối đa 10 giây, chấp nhận vị trí cũ tới 10 phút [đề xuất] (PLAN search 5.7).
export const GEOLOCATION_TIMEOUT_MS = 10_000;
export const GEOLOCATION_MAX_AGE_MS = 600_000;

export type GeolocationFailureReason =
  'UNSUPPORTED' | 'DENIED' | 'TIMEOUT' | 'UNAVAILABLE';

export class GeolocationFailure extends Error {
  readonly reason: GeolocationFailureReason;

  constructor(reason: GeolocationFailureReason) {
    super(reason);
    this.reason = reason;
    this.name = 'GeolocationFailure';
  }
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Xin vị trí hiện tại. Toạ độ chỉ trả về cho nơi gọi để tính khoảng cách; không ghi, không gửi đi đâu (H9).
 * Từ chối/hết giờ/không lấy được ⇒ ném `GeolocationFailure` với lý do để giao diện chọn thông báo.
 */
export function requestPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported() || !navigator.geolocation) {
      reject(new GeolocationFailure('UNSUPPORTED'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => {
        // Mã chuẩn của GeolocationPositionError: 1 bị từ chối, 3 hết giờ, còn lại không xác định được
        const reason: GeolocationFailureReason =
          error.code === 1
            ? 'DENIED'
            : error.code === 3
              ? 'TIMEOUT'
              : 'UNAVAILABLE';
        reject(new GeolocationFailure(reason));
      },
      {
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
        enableHighAccuracy: false,
      },
    );
  });
}

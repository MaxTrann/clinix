import {
  apiError,
  cleanUpFakeTopupApi,
  installFakePaymentFetch,
  type TopupReply,
} from './fake-topup-api';

// API thanh toán cọc giả cho test web của payment F3: thay `fetch` toàn cục (bộ cài chung của F2), KHÔNG gọi backend thật. Dữ liệu giả.

export const MA_LICH_HEN = 'CX20261018581';

export const previewBody = (patch: Record<string, unknown> = {}) => ({
  soTienCan: '100000.00',
  soDuKhaDung: '350000.00',
  soDuSauThanhToan: '250000.00',
  duSoDu: true,
  hanThanhToan: '2026-11-20T03:15:00.000Z',
  thoiGianMayChu: '2026-11-20T03:00:02.000Z',
  ...patch,
});

export const paidBody = (patch: Record<string, unknown> = {}) => ({
  maLichHen: MA_LICH_HEN,
  trangThai: 'DaXacNhan',
  soTien: '100000.00',
  soDuKhaDung: '250000.00',
  daXuLyTruocDo: false,
  ...patch,
});

export { apiError };

export function installFakeDepositApi() {
  const handlers = {
    preview: (): TopupReply => ({ body: previewBody() }),
    pay: (): TopupReply => ({ body: paidBody() }),
  };
  const base = `/patient/appointments/${MA_LICH_HEN}`;
  const fake = installFakePaymentFetch((method, path) => {
    if (method === 'GET' && path === `${base}/payment-preview`)
      return handlers.preview();
    if (method === 'POST' && path === `${base}/payment`) return handlers.pay();
    return null;
  });
  return { ...fake, handlers };
}

export const cleanUpFakeDepositApi = cleanUpFakeTopupApi;

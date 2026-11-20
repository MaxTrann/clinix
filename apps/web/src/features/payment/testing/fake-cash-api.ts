import {
  apiError,
  cleanUpFakeTopupApi,
  installFakePaymentFetch,
  type TopupReply,
} from './fake-topup-api';

// API thu tiền giả cho test web của payment F4: thay `fetch` toàn cục (bộ cài chung của F2), KHÔNG gọi backend thật. Dữ liệu giả.

export const MA_LICH_HEN = 'CP20261018001';

export const cashPreviewBody = (patch: Record<string, unknown> = {}) => ({
  maLichHen: MA_LICH_HEN,
  giaKham: '300000.00',
  daThanhToanTruoc: '100000.00',
  thuTaiQuay: '200000.00',
  ...patch,
});

export const collectedBody = (patch: Record<string, unknown> = {}) => ({
  maLichHen: MA_LICH_HEN,
  trangThai: 'DaTiepDon',
  phieuThu: {
    soPhieu: '77',
    giaKham: '300000.00',
    daThanhToanTruoc: '100000.00',
    thuTaiQuay: '200000.00',
    thoiDiem: '2026-10-18T01:05:00.000Z',
    nguoiThu: 'Lễ Tân Mẫu',
  },
  ...patch,
});

export { apiError };

export function installFakeCashApi() {
  const handlers = {
    preview: (): TopupReply => ({ body: cashPreviewBody() }),
    collect: (): TopupReply => ({ body: collectedBody() }),
  };
  const base = `/reception/appointments/${MA_LICH_HEN}`;
  const fake = installFakePaymentFetch((method, path) => {
    if (method === 'GET' && path === `${base}/cash-preview`)
      return handlers.preview();
    if (method === 'POST' && path === `${base}/collect-cash`)
      return handlers.collect();
    return null;
  });
  return { ...fake, handlers };
}

export const cleanUpFakeCashApi = cleanUpFakeTopupApi;

import {
  adminError,
  installFakeAdminFetch,
  type AdminReply,
} from './fake-admin-withdrawal-api';

// API giả cho tab "Hoàn tiền đặc biệt" (payment F8): thay `fetch` toàn cục bằng bộ cài chung của F7, KHÔNG gọi backend thật. Dữ liệu giả.

export const REFUNDABLE_PATH = '/admin/wallet/refundable-payments';
export const SPECIAL_REFUNDS_PATH = '/admin/wallet/special-refunds';

export const refundable = (patch: Record<string, unknown> = {}) => ({
  maGiaoDich: '77',
  maLichHen: 'CLX-20261010-7K3QF',
  soTien: '300000.00',
  daHoan: '0.00',
  conCoTheHoan: '300000.00',
  thoiDiem: '2026-10-10T02:15:00.000Z',
  ...patch,
});

export { adminError };

export function installFakeSpecialRefundApi() {
  const handlers = {
    list: (query: Record<string, string>): AdminReply => {
      void query;
      return { body: { items: [refundable()] } };
    },
    create: (body: unknown): AdminReply => {
      const { maGiaoDich, soTien } = body as Record<string, string>;
      return { body: { maGiaoDich, soTien: `${soTien}.00` } };
    },
  };
  const fake = installFakeAdminFetch(({ method, path, query, body }) => {
    if (method === 'GET' && path === REFUNDABLE_PATH)
      return handlers.list(query);
    if (method === 'POST' && path === SPECIAL_REFUNDS_PATH)
      return handlers.create(body);
    return adminError(404, 'KHONG_TIM_THAY');
  });
  return { ...fake, handlers, lists: () => fake.gets(REFUNDABLE_PATH) };
}

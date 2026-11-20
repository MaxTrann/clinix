import {
  adminError,
  installFakeAdminFetch,
  type AdminReply,
} from './fake-admin-withdrawal-api';

// API giả cho tab "Nạp ví chưa cộng" (payment F9): thay `fetch` toàn cục bằng bộ cài chung của F7, KHÔNG gọi backend thật. Dữ liệu giả.

export const UNPOSTED_PATH = '/admin/payment/unposted-topups';

export const unposted = (patch: Record<string, unknown> = {}) => ({
  maGiaoDich: '41',
  phuongThuc: 'VNPay',
  maGiaoDichCong: 'VNP20261010091500U2',
  benhNhan: { hoTen: 'Trần Thị B' },
  soTien: '500000.00',
  thoiDiemXacMinh: '2026-10-10T02:15:42.000Z',
  soLanThuTuDong: 3,
  toiDaThuTuDong: 3,
  trangThaiXuLy: 'ChoXuLy',
  lyDoKhongTheXuLy: null,
  ...patch,
});

export { adminError };

export function installFakeUnpostedTopupApi() {
  const handlers = {
    list: (): AdminReply => ({ body: { items: [unposted()] } }),
    credit: (id: string): AdminReply => ({
      body: { maGiaoDich: id, trangThaiDoiSoat: 'DaDoiSoat' },
    }),
    unprocessable: (id: string, body: unknown): AdminReply => {
      void body;
      return { body: { maGiaoDich: id, trangThaiDoiSoat: 'ChoDoiSoat' } };
    },
  };
  const fake = installFakeAdminFetch(({ method, path, body }) => {
    if (method === 'GET' && path === UNPOSTED_PATH) return handlers.list();
    const [id = '', action] = path.slice(UNPOSTED_PATH.length + 1).split('/');
    if (method === 'POST' && action === 'credit') return handlers.credit(id);
    if (method === 'POST' && action === 'mark-unprocessable')
      return handlers.unprocessable(id, body);
    return adminError(404, 'KHONG_TIM_THAY');
  });
  return { ...fake, handlers, lists: () => fake.gets(UNPOSTED_PATH) };
}

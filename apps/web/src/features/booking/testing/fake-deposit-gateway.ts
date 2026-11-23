import { jsonResponse } from './fake-appointment-list-api';

// API giả của HAI điểm cuối thanh toán cọc mà `DepositPaymentPanel` gọi (booking F6; hợp đồng B5 của `payment`), để test Bước Thanh toán chạy panel THẬT qua `fetch` giả:
//   GET  /patient/appointments/:maLichHen/payment-preview  xem trước ⇒ `gateway.preview` (6 khoá)
//   POST /patient/appointments/:maLichHen/payment          thanh toán ⇒ `gateway.paid` (5 khoá)
// Bọc `delegate` như `createFakeAppointmentDetailApi`: đường dẫn khác chuyển cho `delegate`. `testing/` của booking KHÔNG import `features/payment/testing/*` (BWZ-08 cấm import sâu), nên hợp đồng
// được viết lại ở đây; lệch hợp đồng thật sẽ lộ ở test tích hợp qua panel thật. Ghi thân POST để test khẳng định "đúng một POST, thân `{}`". Chỉ test dùng; KHÔNG gọi backend thật; dữ liệu giả.

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type Override = (init?: RequestInit) => Response | Promise<Response>;

export type DepositRoute = 'preview' | 'pay';

export const previewBody = (patch: Record<string, unknown> = {}) => ({
  soTienCan: '100000.00',
  soDuKhaDung: '350000.00',
  soDuSauThanhToan: '250000.00',
  duSoDu: true,
  hanThanhToan: '2026-11-23T08:15:00.000Z',
  thoiGianMayChu: '2026-11-23T08:00:00.000Z',
  ...patch,
});

export const paidBody = (patch: Record<string, unknown> = {}) => ({
  maLichHen: 'CLX-20261123-4P7K2',
  trangThai: 'DaXacNhan',
  soTien: '100000.00',
  soDuKhaDung: '250000.00',
  daXuLyTruocDo: false,
  ...patch,
});

const ROUTE_PATTERN =
  /^\/patient\/appointments\/([^/]+)\/(payment-preview|payment)$/;

export function createFakeDepositGateway(delegate: FetchLike) {
  const overrides: Record<DepositRoute, Override[]> = { preview: [], pay: [] };

  const gateway = {
    // Thân 200 của hai điểm cuối; kiểu `unknown` để test đặt cả thân sai hợp đồng
    preview: previewBody() as unknown,
    paid: paidBody() as unknown,
    // Thân của từng lần POST (chuỗi JSON hoặc `null`)
    postBodies: [] as (string | null)[],

    // Lần gọi kế tiếp tới `route` dùng phản hồi này (lỗi, 409, ném lỗi mạng, hay Promise treo tới khi test cho chạy tiếp)
    failNext(route: DepositRoute, override: Override) {
      overrides[route].push(override);
    },

    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      const path = pathname.replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const match = ROUTE_PATTERN.exec(path);
      let route: DepositRoute | null = null;
      if (match !== null) {
        if (match[2] === 'payment-preview' && method === 'GET')
          route = 'preview';
        if (match[2] === 'payment' && method === 'POST') route = 'pay';
      }
      if (route === null) return delegate(input, init);

      if (route === 'pay') {
        gateway.postBodies.push(
          typeof init?.body === 'string' ? init.body : null,
        );
      }
      const override = overrides[route].shift();
      if (override) return override(init);
      return jsonResponse(route === 'preview' ? gateway.preview : gateway.paid);
    },
  };
  return gateway;
}

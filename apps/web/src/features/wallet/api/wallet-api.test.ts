import { afterEach, describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  OVERVIEW,
  cleanUpFakeWalletApi,
  installFakeWalletApi,
  page,
  tx,
} from '../testing/fake-wallet-api';
import {
  getWalletOverview,
  getWalletTransactions,
  parseWalletOverview,
  parseWalletTransactionPage,
} from './wallet-api';

// payment F1: lời gọi và bộ kiểm hình dạng hai API đọc ví. Dữ liệu giả.
afterEach(cleanUpFakeWalletApi);

const unusableOverview = (raw: unknown) =>
  expect(() => parseWalletOverview(raw)).toThrow(UnexpectedResponseError);
const unusablePage = (raw: unknown) =>
  expect(() => parseWalletTransactionPage(raw)).toThrow(
    UnexpectedResponseError,
  );

describe('wallet-api (payment F1)', () => {
  it('WVI-01 đọc đúng ba con số và yêu cầu rút gần nhất, giữ NGUYÊN chuỗi của máy chủ; F2: chuyển tiếp hạn mức nạp và cổng', () => {
    expect(
      parseWalletOverview({
        ...OVERVIEW,
        napChoXacNhan: '150000.00',
        yeuCauRutGanNhat: {
          maYeuCau: '7',
          soTien: '100000.00',
          trangThai: 'ChoDuyet',
          thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
        },
      }),
    ).toEqual({
      soDuKhaDung: '350000.00',
      soTienDangGiu: '0.00',
      napChoXacNhan: '150000.00',
      yeuCauRutGanNhat: {
        maYeuCau: '7',
        soTien: '100000.00',
        trangThai: 'ChoDuyet',
        thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
      },
      hanMucNap: { toiThieu: '50000.00', toiDa: '2000000.00' },
      congThanhToan: ['VNPay'],
    });
  });

  it('WVI-04 ★ tiền là `number` (đã qua JSON, có thể mất chính xác) ⇒ coi là phản hồi hỏng, không hiển thị', () => {
    unusableOverview({ ...OVERVIEW, soDuKhaDung: 350000 });
    unusableOverview({ ...OVERVIEW, soTienDangGiu: '1e5' });
    unusablePage(page([tx({ soTien: -100000 })]));
  });

  it('ca âm: thiếu khoá, trạng thái hay loại lạ, `quaCuaSo` không phải boolean, thân không phải đối tượng', () => {
    unusableOverview(null);
    unusableOverview([]);
    const { napChoXacNhan, ...missing } = OVERVIEW;
    void napChoXacNhan;
    unusableOverview(missing);
    unusableOverview({
      ...OVERVIEW,
      yeuCauRutGanNhat: {
        maYeuCau: '7',
        soTien: '1.00',
        trangThai: 'HetHan',
        thoiDiemYeuCau: '2026-10-18T00:10:00.000Z',
      },
    });
    unusablePage(page([tx({ loai: 'Khac' })]));
    unusablePage(page([tx({ trangThai: 'HetHan' })]));
    unusablePage(page([tx({ quaCuaSo: 'false' })]));
    unusablePage(page([tx({ thoiDiem: 'không phải ngày' })]));
    unusablePage({ items: 'x', total: 0, trang: 1, kichThuoc: 20 });
    unusablePage(page([], { trang: 0 }));
    unusablePage(page([], { total: -1 }));
  });

  it('payment F2 ca âm: hạn mức nạp thiếu, tiền dạng số; danh sách cổng không phải mảng chuỗi ⇒ phản hồi hỏng', () => {
    unusableOverview({ ...OVERVIEW, hanMucNap: undefined });
    unusableOverview({
      ...OVERVIEW,
      hanMucNap: { toiThieu: 50000, toiDa: '2000000.00' },
    });
    unusableOverview({ ...OVERVIEW, congThanhToan: 'VNPay' });
    unusableOverview({ ...OVERVIEW, congThanhToan: ['VNPay', 1] });
  });

  it('gọi đúng đường dẫn, gắn access token, chỉ gửi `trang` và `loai` (không lọc thì KHÔNG gửi `loai`, không bao giờ gửi `benhNhanId`)', async () => {
    const api = installFakeWalletApi();
    await getWalletOverview();
    await getWalletTransactions({ trang: 1, loai: null });
    await getWalletTransactions({ trang: 3, loai: 'Rut' });

    expect(api.requests.map((r) => [r.path, r.query])).toEqual([
      ['/patient/wallet', {}],
      ['/patient/wallet/transactions', { trang: '1' }],
      ['/patient/wallet/transactions', { trang: '3', loai: 'Rut' }],
    ]);
    for (const request of api.requests) {
      expect(request.authorization).toBe('Bearer token-gia');
    }
  });
});

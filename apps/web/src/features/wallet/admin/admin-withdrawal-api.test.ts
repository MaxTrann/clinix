import { afterEach, describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  cleanUpFakeAdminWithdrawalApi,
  detail,
  installFakeAdminWithdrawalApi,
  item,
  listPage,
} from '../testing/fake-admin-withdrawal-api';
import {
  approveWithdrawal,
  getAdminWithdrawal,
  getAdminWithdrawals,
  parseWithdrawalDecided,
  parseWithdrawalDetail,
  parseWithdrawalPage,
  rejectWithdrawal,
} from './admin-withdrawal-api';

// payment F7: lời gọi và bộ kiểm hình dạng bốn API Quản trị viên về rút tiền (hợp đồng B12). Dữ liệu giả.
afterEach(cleanUpFakeAdminWithdrawalApi);

const broken = (parse: (raw: unknown) => unknown, raw: unknown) =>
  expect(() => parse(raw)).toThrow(UnexpectedResponseError);

describe('admin-withdrawal-api (payment F7)', () => {
  it('WQL-01 đọc danh sách và số đếm, giữ NGUYÊN chuỗi tiền; `thoiDiemXuLy` null hay ISO', () => {
    const page = parseWithdrawalPage(
      listPage([
        item(),
        item({
          maYeuCau: '9',
          trangThai: 'DaDuyet',
          thoiDiemXuLy: '2026-10-07T07:00:00.000Z',
        }),
      ]),
    );
    expect(page.items.map((i) => [i.soTien, i.thoiDiemXuLy])).toEqual([
      ['100000.00', null],
      ['100000.00', '2026-10-07T07:00:00.000Z'],
    ]);
    expect(page.demTheoTrangThai).toEqual({
      tatCa: 5,
      choDuyet: 3,
      daDuyet: 1,
      tuChoi: 1,
    });
  });

  it('WQL-01 ca âm: tiền là `number`, trạng thái lạ, thiếu họ tên, số đếm âm, items không phải mảng ⇒ phản hồi hỏng', () => {
    broken(parseWithdrawalPage, listPage([item({ soTien: 100000 })]));
    broken(parseWithdrawalPage, listPage([item({ trangThai: 'HetHan' })]));
    broken(parseWithdrawalPage, listPage([item({ benhNhan: {} })]));
    broken(
      parseWithdrawalPage,
      listPage([], {
        demTheoTrangThai: { tatCa: -1, choDuyet: 0, daDuyet: 0, tuChoi: 0 },
      }),
    );
    broken(parseWithdrawalPage, { ...listPage([]), items: 'x' });
    broken(parseWithdrawalPage, null);
  });

  it('WQL-02 chi tiết: hai số ví và giao dịch gần đây; ca âm: số dư là `number`, loại giao dịch lạ', () => {
    expect(parseWithdrawalDetail(detail())).toMatchObject({
      soDuHienTai: '1000000.00',
      soTienDangGiu: '300000.00',
      giaoDichGanDay: [{ loai: 'Nap', soTien: '500000.00' }],
    });
    broken(parseWithdrawalDetail, detail({ soDuHienTai: 1000000 }));
    broken(
      parseWithdrawalDetail,
      detail({
        giaoDichGanDay: [{ thoiDiem: '2026-10-01', loai: 'X', soTien: '1.00' }],
      }),
    );
    broken(parseWithdrawalDecided, { maYeuCau: '1', trangThai: 'Khac' });
  });

  it('WQL-01, WQL-02 gọi đúng đường dẫn; lọc "tất cả" KHÔNG gửi `trangThai`; duyệt thân rỗng; từ chối chỉ có `ghiChu`', async () => {
    const api = installFakeAdminWithdrawalApi();
    await getAdminWithdrawals({ trangThai: null, trang: 1 });
    await getAdminWithdrawals({ trangThai: 'ChoDuyet', trang: 2 });
    await getAdminWithdrawal('12');
    await approveWithdrawal('12');
    await rejectWithdrawal('13', 'Sai thông tin');
    expect(
      api.requests.map((r) => [r.method, r.path, r.query, r.body]),
    ).toEqual([
      ['GET', '/admin/wallet/withdrawals', { trang: '1' }, undefined],
      [
        'GET',
        '/admin/wallet/withdrawals',
        { trang: '2', trangThai: 'ChoDuyet' },
        undefined,
      ],
      ['GET', '/admin/wallet/withdrawals/12', {}, undefined],
      ['POST', '/admin/wallet/withdrawals/12/approve', {}, {}],
      [
        'POST',
        '/admin/wallet/withdrawals/13/reject',
        {},
        { ghiChu: 'Sai thông tin' },
      ],
    ]);
  });
});

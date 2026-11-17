import {
  describeRow,
  isPastWindow,
  toTransactionItem,
  toWithdrawalSummary,
  type HistoryRow,
} from './wallet-balance.mapper.js';

// payment B1 — hàm thuần của lịch sử ví (SDV-05 phần nội dung, SDV-08 danh sách trắng, SDV-09 biên cửa sổ). Không DB.
const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  nguon: 'vi',
  id: '7',
  thoiDiem: new Date('2026-11-17T01:00:00Z'),
  loai: 'Nap',
  soTien: '100000.00',
  trangThai: 'ThanhCong',
  phuongThuc: null,
  maLichHen: null,
  loaiHoan: null,
  ...over,
});

describe('SDV-05 nội dung của từng loại dòng', () => {
  it.each([
    [{ loai: 'Nap', phuongThuc: 'VNPay' }, 'Nạp tiền vào ví qua VNPay'],
    [{ loai: 'Nap' }, 'Nạp tiền vào ví'],
    [
      { loai: 'ThanhToan', maLichHen: 'LH0001' },
      'Thanh toán đặt cọc lịch hẹn LH0001',
    ],
    [
      { loai: 'HoanTien', loaiHoan: 'TuDong', maLichHen: 'LH0001' },
      'Hoàn tiền cọc lịch hẹn LH0001',
    ],
    [
      { loai: 'HoanTien', loaiHoan: 'DacBiet', maLichHen: 'LH0001' },
      'Hoàn tiền đặc biệt lịch hẹn LH0001',
    ],
    [{ loai: 'Rut' }, 'Rút tiền từ ví'],
  ] as [Partial<HistoryRow>, string][])('%j ⇒ %s', (over, expected) => {
    expect(describeRow(row(over))).toBe(expected);
  });
});

describe('SDV-09 biên cửa sổ nạp chờ xác nhận (90 phút)', () => {
  const created = new Date('2026-11-17T01:00:00Z');
  const pending = { trangThai: 'DangXuLy', phuongThuc: 'VNPay' };
  const at = (minutes: number, seconds = 0) =>
    new Date(created.getTime() + (minutes * 60 + seconds) * 1000);

  it('đúng 90 phút vẫn còn trong cửa sổ; thêm một giây thì quá', () => {
    const base = { ...pending, thoiDiem: created };
    expect(isPastWindow(base, at(90))).toBe(false);
    expect(isPastWindow(base, at(90, 1))).toBe(true);
    expect(isPastWindow(base, at(0))).toBe(false);
  });

  it('chỉ DangXuLy của cổng đã biết mới có thể quá cửa sổ', () => {
    for (const trangThai of ['ThanhCong', 'ThatBai', 'ChoDuyet', 'TuChoi'])
      expect(
        isPastWindow(
          { trangThai, phuongThuc: 'VNPay', thoiDiem: created },
          at(999),
        ),
      ).toBe(false);
    expect(
      isPastWindow(
        { trangThai: 'DangXuLy', phuongThuc: null, thoiDiem: created },
        at(999),
      ),
    ).toBe(false);
  });
});

describe('SDV-08 danh sách trắng khoá', () => {
  it('dòng lịch sử đúng bảy khoá, id có tiền tố nguồn, thời điểm ISO; không rò cột phụ của hàng thô', () => {
    const item = toTransactionItem(
      row({
        nguon: 'rut',
        phuongThuc: 'VNPay',
        maLichHen: 'LH0001',
        loaiHoan: 'DacBiet',
      }),
      new Date('2026-11-17T03:00:00Z'),
    );
    expect(Object.keys(item).toSorted()).toEqual([
      'id',
      'loai',
      'noiDung',
      'quaCuaSo',
      'soTien',
      'thoiDiem',
      'trangThai',
    ]);
    expect(item.id).toBe('rut-7');
    expect(item.thoiDiem).toBe('2026-11-17T01:00:00.000Z');
  });

  it('yeuCauRutGanNhat đúng bốn khoá, id ra chuỗi', () => {
    const summary = toWithdrawalSummary({
      maYeuCau: 12 as unknown as string,
      soTien: '50000.00',
      trangThai: 'ChoDuyet',
      thoiDiemYeuCau: new Date('2026-11-12T02:30:00Z'),
    });
    expect(summary).toEqual({
      maYeuCau: '12',
      soTien: '50000.00',
      trangThai: 'ChoDuyet',
      thoiDiemYeuCau: '2026-11-12T02:30:00.000Z',
    });
  });
});

import { toItemCore } from './list-item.mapper.js';
import type { ListItemRow } from './list-query.sql.js';

// Mười khoá chung của một dòng danh sách (B1, B3, B4; TRACKING 3.17 B3-D). Hàm THUẦN. Mã LSH-19, DSV-08, DSV-13 là PLAN 7.4, 7.7 và [đề xuất] (TRACKING 3.17.3).
function row(overrides: Partial<ListItemRow> = {}): ListItemRow {
  return {
    maLichHen: 'CLX-20261110-ABCDE',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T01:00:00.000Z'),
    bacSi: 'Bác sĩ A',
    chuyenKhoa: 'Nội',
    chiNhanh: 'Chi nhánh 1',
    dichVu: 'Khám nội',
    laBanThan: 1,
    nguoiKham: 'Người Khám',
    giaSnapshot: '150000.00',
    tienCoc: '50000.00',
    hanThanhToan: null,
    ...overrides,
  };
}

describe('toItemCore', () => {
  it('LSH-19, DSV-13 đúng MƯỜI khoá, kiểu từng khoá: `thoiGian` ISO UTC, tiền là chuỗi decimal, `nguoiKham` có `laBanThan` boolean', () => {
    expect(toItemCore(row())).toStrictEqual({
      maLichHen: 'CLX-20261110-ABCDE',
      trangThai: 'DaXacNhan',
      thoiGian: '2026-11-10T01:00:00.000Z',
      bacSi: 'Bác sĩ A',
      chuyenKhoa: 'Nội',
      chiNhanh: 'Chi nhánh 1',
      dichVu: 'Khám nội',
      nguoiKham: { hoTen: 'Người Khám', laBanThan: true },
      giaSnapshot: '150000.00',
      tienCoc: '50000.00',
    });
  });

  it('DSV-08 chỉ liệt kê từng khoá: cột thừa của hàng thô (`lichHenId`, `hanThanhToan`, `nguoiDatSoDienThoai`) KHÔNG lọt ra, kể cả khi hàng có thêm', () => {
    const result = toItemCore(
      row({
        ...({
          lichHenId: '99',
          benhNhanId: '7',
          nguoiDatSoDienThoai: '0900000000',
        } as object),
        hanThanhToan: new Date('2026-11-10T02:00:00.000Z'),
      }),
    );
    expect(Object.keys(result).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'chuyenKhoa',
      'dichVu',
      'giaSnapshot',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'tienCoc',
      'trangThai',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/99|0900000000|"7"/);
  });

  it.each([
    [1, true],
    ['1', true],
    [0, false],
    ['0', false],
  ])(
    'LSH-19 `laBanThan` đọc từ giá trị driver %j ⇒ %j (BIGINT và biểu thức logic ra số hoặc chuỗi)',
    (raw, expected) => {
      expect(toItemCore(row({ laBanThan: raw })).nguoiKham.laBanThan).toBe(
        expected,
      );
    },
  );

  it('giữ nguyên kiểu trạng thái của vai trò (không ép): `DaDoiLich` đi qua cho nhân sự', () => {
    expect(toItemCore(row({ trangThai: 'DaDoiLich' })).trangThai).toBe(
      'DaDoiLich',
    );
  });
});

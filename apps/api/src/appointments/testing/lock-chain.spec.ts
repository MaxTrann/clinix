import { findLockOrderViolation } from '../locking/lock-order.js';
import { lockedTablesOf, lockedTablesOfDistinct } from './lock-chain.js';
import type { StatementCall } from './statement-recorder.js';

// reschedule B1 — HDL-16 `[đề xuất]` (PLAN reschedule 5.4; phát hiện của B2): `lockedTablesOfDistinct` bỏ câu khoá GIỐNG HỆT (cùng SQL, cùng tham số) một câu đã chạy, vì đó là xin lại hàng ĐÃ GIỮ.
// `findLockOrderViolation` không đổi (chỉ nhìn tên bảng): hàm này chỉ chuẩn bị chuỗi đưa cho nó.
const call = (sql: string, ...params: unknown[]): StatementCall => ({
  sql,
  params,
});

const BENH_NHAN = (id: string) =>
  call(
    'SELECT tai_khoan_id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE',
    id,
  );
const HO_SO = call(
  'SELECT trang_thai_hieu_luc FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ? AND benh_nhan_id = ? FOR UPDATE',
  '8',
  '31',
);
const BAC_SI = call(
  'SELECT chi_nhanh_id FROM bac_si WHERE tai_khoan_id = ? FOR SHARE',
  '5',
);
const KHUNG_GIO = (id: string) =>
  call(
    'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE',
    id,
  );
const LICH_HEN = call(
  'SELECT benh_nhan_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
  '41',
);
const READ_ONLY = call('SELECT 1 FROM lich_hen WHERE ma_lich_hen = ?', 'CLX-1');

const sqls = (calls: readonly StatementCall[]) => calls.map((c) => c.sql);

// Chuỗi B4: `reschedule-locks.ts` giữ tầng 2 đến 6, rồi `RescheduleReader.read(…, 'locked')` (B2) xin lại `bac_si` và `khung_gio` của khung giờ ĐÍCH (id 10)
const B4_CHAIN: StatementCall[] = [
  BENH_NHAN('31'),
  HO_SO,
  BAC_SI,
  KHUNG_GIO('9'),
  KHUNG_GIO('10'),
  LICH_HEN,
  READ_ONLY,
  BAC_SI,
  KHUNG_GIO('10'),
];

describe('HDL-16 lockedTablesOfDistinct', () => {
  it('chuỗi B4 (đọc lại bac_si và khung_gio đích sau lich_hen) ⇒ không vi phạm; còn bản KHÔNG lọc thì báo nhầm "tầng 4 sau tầng 6" (lý do hàm này tồn tại)', () => {
    expect(lockedTablesOfDistinct(B4_CHAIN)).toEqual([
      'benh_nhan',
      'ho_so_nguoi_than',
      'bac_si',
      'khung_gio',
      'khung_gio',
      'lich_hen',
    ]);
    expect(findLockOrderViolation(lockedTablesOfDistinct(B4_CHAIN))).toBeNull();
    expect(findLockOrderViolation(lockedTablesOf(sqls(B4_CHAIN)))).toEqual({
      index: 6,
      truoc: 'lich_hen',
      sau: 'bac_si',
    });
  });

  it('hai khung giờ KHÁC NHAU cùng chữ SQL đều được tính (khoá hàng thứ hai không phải xin lại)', () => {
    const tables = lockedTablesOfDistinct([KHUNG_GIO('9'), KHUNG_GIO('10')]);

    expect(tables).toEqual(['khung_gio', 'khung_gio']);
  });

  it('chuỗi thật sự ngược thứ tự vẫn bị bắt: khoá khung giờ MỚI (chưa từng khoá) SAU lich_hen', () => {
    const wrong = [
      BENH_NHAN('31'),
      BAC_SI,
      KHUNG_GIO('9'),
      LICH_HEN,
      KHUNG_GIO('10'),
    ];

    expect(findLockOrderViolation(lockedTablesOfDistinct(wrong))).toEqual({
      index: 4,
      truoc: 'lich_hen',
      sau: 'khung_gio',
    });
  });

  it('cùng SQL nhưng tham số khác ở BẤT KỲ vị trí nào là câu khoá mới (hồ sơ của chủ khác)', () => {
    const other = call(HO_SO.sql, '8', '99');

    expect(lockedTablesOfDistinct([HO_SO, other])).toEqual([
      'ho_so_nguoi_than',
      'ho_so_nguoi_than',
    ]);
  });

  it('câu không khoá (SELECT thường, INSERT, UPDATE) bị bỏ qua; params vắng và [] là một', () => {
    const noParams: StatementCall = { sql: BAC_SI.sql, params: undefined };
    const empty: StatementCall = { sql: BAC_SI.sql, params: [] };

    expect(
      lockedTablesOfDistinct([
        READ_ONLY,
        call(
          'UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ?',
          'x',
          '1',
        ),
        noParams,
        empty,
      ]),
    ).toEqual(['bac_si']);
  });

  it('danh sách rỗng ⇒ rỗng; thứ tự lần xin ĐẦU được giữ', () => {
    expect(lockedTablesOfDistinct([])).toEqual([]);
    expect(
      lockedTablesOfDistinct([LICH_HEN, KHUNG_GIO('1'), LICH_HEN]),
    ).toEqual(['lich_hen', 'khung_gio']);
  });
});

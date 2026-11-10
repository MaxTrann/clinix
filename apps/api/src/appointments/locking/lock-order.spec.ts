import {
  LICH_HEN_FORBIDDEN_LOCK_COLUMNS,
  LICH_HEN_LOCK_KEYS,
  LOCK_ORDER,
  findLockOrderViolation,
} from './lock-order.js';

// Task P1 — LOK-01…LOK-04 (PLAN booking 7.17; TRACKING 3.3 P1-F). Danh sách mong đợi viết RIÊNG theo bảng 5.3.
describe('LOK-01 bảng tầng khoá của 5.3', () => {
  it('tầng 1, 2, 3, 4, 4b, 5, 6, 7 đúng thứ tự (tầng 7 gồm ba hạng liền nhau) và đúng bảng', () => {
    expect(LOCK_ORDER.map((rank) => rank.tang)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '4b',
      '5',
      '6',
      '7',
      '7',
      '7',
    ]);
    expect(LOCK_ORDER.slice(0, 7).map((rank) => rank.bang)).toEqual([
      ['tai_khoan'],
      ['benh_nhan'],
      ['ho_so_nguoi_than'],
      ['bac_si'],
      ['dich_vu_kham'],
      ['khung_gio'],
      ['lich_hen'],
    ]);
    expect(LOCK_ORDER.slice(7).map((rank) => rank.bang)).toEqual([
      ['giao_dich_thanh_toan'],
      ['vi_noi_bo'],
      ['lich_su_hoan_tien', 'giao_dich_vi', 'thong_bao', 'nhat_ky_hanh_dong'],
    ]);
  });

  it('mỗi bảng chỉ thuộc đúng một hạng; 4b nằm giữa 4 và 5 (khớp doctor D11)', () => {
    const tables = LOCK_ORDER.flatMap((rank) => rank.bang);
    expect(new Set(tables).size).toBe(tables.length);
    const tiers = LOCK_ORDER.map((rank) => rank.tang);
    expect(tiers.indexOf('4b')).toBe(tiers.indexOf('4') + 1);
    expect(tiers.indexOf('5')).toBe(tiers.indexOf('4b') + 1);
  });
});

describe('LOK-02 findLockOrderViolation: chuỗi hợp lệ', () => {
  it.each([
    [
      'tạo lịch hẹn',
      ['benh_nhan', 'ho_so_nguoi_than', 'bac_si', 'khung_gio', 'lich_hen'],
    ],
    ['huỷ lịch hẹn', ['khung_gio', 'lich_hen']],
    ['payment xác nhận', ['lich_hen', 'giao_dich_thanh_toan', 'vi_noi_bo']],
    ['hết hạn qua khung giờ', ['khung_gio', 'lich_hen', 'thong_bao']],
    ['Vắng mặt', ['benh_nhan', 'lich_hen', 'nhat_ky_hanh_dong']],
    ['doctor phân công', ['bac_si', 'dich_vu_kham']],
    ['lặp cùng bảng', ['khung_gio', 'khung_gio', 'lich_hen', 'lich_hen']],
    [
      'bảng chỉ-thêm cùng hạng theo thứ tự nào cũng được',
      ['lich_hen', 'thong_bao', 'nhat_ky_hanh_dong', 'thong_bao'],
    ],
    ['chuỗi rỗng', []],
    ['bảng ngoài thứ tự bị bỏ qua', ['chi_nhanh', 'lich_hen', 'chi_nhanh']],
  ])('%s ⇒ null', (_name, steps) => {
    expect(findLockOrderViolation(steps)).toBeNull();
  });
});

describe('LOK-03 findLockOrderViolation: chuỗi ngược', () => {
  it.each([
    [
      'lich_hen trước khung_gio (doctor M12)',
      ['lich_hen', 'khung_gio'],
      { index: 1, truoc: 'lich_hen', sau: 'khung_gio' },
    ],
    [
      'ho_so_nguoi_than trước benh_nhan (hợp đồng patient)',
      ['ho_so_nguoi_than', 'benh_nhan'],
      { index: 1, truoc: 'ho_so_nguoi_than', sau: 'benh_nhan' },
    ],
    [
      'khung_gio trước bac_si',
      ['khung_gio', 'bac_si'],
      { index: 1, truoc: 'khung_gio', sau: 'bac_si' },
    ],
    [
      'vi_noi_bo trước lich_hen (payment phải khoá lich_hen trước)',
      ['vi_noi_bo', 'lich_hen'],
      { index: 1, truoc: 'vi_noi_bo', sau: 'lich_hen' },
    ],
    [
      'vi_noi_bo trước giao_dich_thanh_toan',
      ['vi_noi_bo', 'giao_dich_thanh_toan'],
      { index: 1, truoc: 'vi_noi_bo', sau: 'giao_dich_thanh_toan' },
    ],
    [
      'tai_khoan sau benh_nhan',
      ['benh_nhan', 'tai_khoan'],
      { index: 1, truoc: 'benh_nhan', sau: 'tai_khoan' },
    ],
  ])('%s', (_name, steps, expected) => {
    expect(findLockOrderViolation(steps)).toEqual(expected);
  });

  it('trả vi phạm ĐẦU TIÊN, và bảng cao nhất đã xin trước đó (kể cả khi nằm cách vài bước)', () => {
    expect(
      findLockOrderViolation([
        'benh_nhan',
        'lich_hen',
        'chi_nhanh',
        'bac_si',
        'khung_gio',
      ]),
    ).toEqual({ index: 3, truoc: 'lich_hen', sau: 'bac_si' });
  });
});

describe('LOK-04 quy tắc 7: khoá lich_hen', () => {
  it('khoá hợp lệ là lich_hen_id và ma_lich_hen; cột cấm là khung_gio_id và khung_gio_dang_giu', () => {
    expect([...LICH_HEN_LOCK_KEYS]).toEqual(['lich_hen_id', 'ma_lich_hen']);
    expect([...LICH_HEN_FORBIDDEN_LOCK_COLUMNS]).toEqual([
      'khung_gio_id',
      'khung_gio_dang_giu',
    ]);
    // Không cột nào vừa hợp lệ vừa bị cấm
    for (const column of LICH_HEN_FORBIDDEN_LOCK_COLUMNS)
      expect(LICH_HEN_LOCK_KEYS as readonly string[]).not.toContain(column);
  });
});

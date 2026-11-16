import {
  LICH_HEN_FORBIDDEN_LOCK_COLUMNS,
  LICH_HEN_LOCK_KEYS,
  LOCK_ORDER,
  findLockOrderViolation,
} from './lock-order.js';

// Task P1 — LOK-01…LOK-04 (PLAN booking 7.17; TRACKING 3.3 P1-F). Danh sách mong đợi viết RIÊNG theo bảng 5.3.
describe('LOK-01 bảng tầng khoá của 5.3', () => {
  // doctor-exam P2: thêm hạng 6b giữa 6 và 7 nên danh sách liệt kê đổi (tầng 7 lùi từ vị trí 7 sang 8); hành vi các hạng cũ không đổi.
  // payment P2: tầng 7 tách thành 7a, 7b, 7c (PLAN payment 5.3); số hạng và vị trí không đổi, chỉ nhãn.
  it('tầng 1, 2, 3, 4, 4b, 5, 6, 6b, 7a, 7b, 7c đúng thứ tự và đúng bảng', () => {
    expect(LOCK_ORDER.map((rank) => rank.tang)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '4b',
      '5',
      '6',
      '6b',
      '7a',
      '7b',
      '7c',
    ]);
    expect(LOCK_ORDER.slice(0, 8).map((rank) => rank.bang)).toEqual([
      ['tai_khoan'],
      ['benh_nhan'],
      ['ho_so_nguoi_than'],
      ['bac_si'],
      ['dich_vu_kham'],
      ['khung_gio'],
      ['lich_hen'],
      ['ho_so_kham', 'danh_gia_bac_si'],
    ]);
    expect(LOCK_ORDER.slice(8).map((rank) => rank.bang)).toEqual([
      ['giao_dich_thanh_toan', 'yeu_cau_rut_tien'],
      ['vi_noi_bo'],
      [
        'lich_su_hoan_tien',
        'giao_dich_vi',
        'lan_doi_soat_nap_vi',
        'thong_bao',
        'nhat_ky_hanh_dong',
      ],
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

// doctor-exam P2 (#392) — HDK-05: tầng 6b (`ho_so_kham`, `danh_gia_bac_si`) nằm giữa `lich_hen` (6) và tầng 7 (PLAN doctor-exam 5.3, E5).
// Phạm vi ở đây: bảng thứ tự và `findLockOrderViolation`. Chuỗi khoá bằng câu SQL THẬT của HSK, DGB, KDD kiểm ở B2, B6, B8 (`testing/lock-chain.ts`).
describe('HDK-05 tầng 6b của doctor (hồ sơ khám, đánh giá)', () => {
  it('6b đứng ngay sau lich_hen và ngay trước tầng 7 đầu tiên (7a); hai bảng cùng một hạng', () => {
    const tiers = LOCK_ORDER.map((rank) => rank.tang);
    expect(tiers.indexOf('6b')).toBe(tiers.indexOf('6') + 1);
    expect(tiers.indexOf('7a')).toBe(tiers.indexOf('6b') + 1);
    expect(LOCK_ORDER[tiers.indexOf('6b')]?.bang).toEqual([
      'ho_so_kham',
      'danh_gia_bac_si',
    ]);
  });

  it.each([
    [
      'HSK sửa sau Hoàn thành: khoá lịch, khoá hồ sơ, ghi nhật ký',
      ['lich_hen', 'ho_so_kham', 'nhat_ky_hanh_dong'],
    ],
    ['HSK ghi lần đầu (không nhật ký)', ['lich_hen', 'ho_so_kham']],
    ['DGB: lịch rồi đánh giá', ['lich_hen', 'danh_gia_bac_si']],
    [
      'KDD ẩn: khoá đánh giá rồi ghi nhật ký',
      ['danh_gia_bac_si', 'nhat_ky_hanh_dong'],
    ],
    [
      'HTK: complete rồi thông báo (chuỗi cũ, không đổi)',
      ['lich_hen', 'thong_bao'],
    ],
    [
      'hai bảng của 6b theo thứ tự nào cũng được',
      ['ho_so_kham', 'danh_gia_bac_si', 'ho_so_kham'],
    ],
    ['lặp cùng bảng', ['lich_hen', 'lich_hen', 'ho_so_kham', 'ho_so_kham']],
    [
      'từ ngoài vào: khung_gio, lich_hen, ho_so_kham',
      ['khung_gio', 'lich_hen', 'ho_so_kham'],
    ],
    [
      '6b trước toàn bộ tầng 7',
      [
        'lich_hen',
        'ho_so_kham',
        'giao_dich_thanh_toan',
        'vi_noi_bo',
        'nhat_ky_hanh_dong',
      ],
    ],
  ])('%s ⇒ null', (_name, steps) => {
    expect(findLockOrderViolation(steps)).toBeNull();
  });

  it.each([
    [
      'ho_so_kham trước lich_hen (hàng con khoá trước hàng cha)',
      ['ho_so_kham', 'lich_hen'],
      { index: 1, truoc: 'ho_so_kham', sau: 'lich_hen' },
    ],
    [
      'danh_gia_bac_si trước lich_hen',
      ['danh_gia_bac_si', 'lich_hen'],
      { index: 1, truoc: 'danh_gia_bac_si', sau: 'lich_hen' },
    ],
    [
      'nhật ký trước khi khoá hồ sơ',
      ['nhat_ky_hanh_dong', 'ho_so_kham'],
      { index: 1, truoc: 'nhat_ky_hanh_dong', sau: 'ho_so_kham' },
    ],
    [
      'thông báo trước khi khoá đánh giá',
      ['thong_bao', 'danh_gia_bac_si'],
      { index: 1, truoc: 'thong_bao', sau: 'danh_gia_bac_si' },
    ],
    [
      'giao_dich_thanh_toan trước ho_so_kham',
      ['giao_dich_thanh_toan', 'ho_so_kham'],
      { index: 1, truoc: 'giao_dich_thanh_toan', sau: 'ho_so_kham' },
    ],
    [
      'vi_noi_bo trước danh_gia_bac_si',
      ['vi_noi_bo', 'danh_gia_bac_si'],
      { index: 1, truoc: 'vi_noi_bo', sau: 'danh_gia_bac_si' },
    ],
    [
      'ho_so_kham trước khung_gio (scope này không bao giờ xin tầng 1 đến 5, nhưng chiều ngược vẫn bị bắt)',
      ['ho_so_kham', 'khung_gio'],
      { index: 1, truoc: 'ho_so_kham', sau: 'khung_gio' },
    ],
    [
      'danh_gia_bac_si trước bac_si',
      ['danh_gia_bac_si', 'bac_si'],
      { index: 1, truoc: 'danh_gia_bac_si', sau: 'bac_si' },
    ],
    [
      'vi phạm đầu tiên, cách vài bước (bảng ngoài thứ tự bị bỏ qua)',
      ['lich_hen', 'ho_so_kham', 'chi_nhanh', 'khung_gio'],
      { index: 3, truoc: 'ho_so_kham', sau: 'khung_gio' },
    ],
  ])('%s', (_name, steps, expected) => {
    expect(findLockOrderViolation(steps)).toEqual(expected);
  });
});

// payment P2 — HDT-14 (phần đơn vị): chuỗi khoá TƯỜNG MINH của mọi luồng ở PLAN payment 5.3 không vi phạm; chiều ngược bị bắt.
// Chuỗi chỉ liệt kê khoá, không liệt kê `INSERT` hàng mới vào bảng 7a (hàng mới không ai khác khoá được). Phần chạy trên MySQL thật: lock-order.int-spec.ts.
describe('HDT-14 hạng 7a, 7b, 7c của payment và wallet', () => {
  it.each([
    [
      'E6 thanh toán cọc bằng ví',
      ['khung_gio', 'lich_hen', 'vi_noi_bo', 'giao_dich_vi', 'thong_bao'],
    ],
    ['E7 thu tiền mặt', ['lich_hen']],
    [
      'E4 hoàn cọc khi huỷ',
      [
        'giao_dich_thanh_toan',
        'vi_noi_bo',
        'lich_su_hoan_tien',
        'giao_dich_vi',
        'thong_bao',
      ],
    ],
    [
      'IPN nạp ví',
      ['giao_dich_thanh_toan', 'vi_noi_bo', 'giao_dich_vi', 'thong_bao'],
    ],
    [
      'đối soát nạp ví',
      [
        'giao_dich_thanh_toan',
        'vi_noi_bo',
        'giao_dich_vi',
        'lan_doi_soat_nap_vi',
        'thong_bao',
        'nhat_ky_hanh_dong',
      ],
    ],
    ['tạo yêu cầu rút tiền', ['vi_noi_bo', 'thong_bao']],
    [
      'duyệt hoặc từ chối rút tiền',
      [
        'yeu_cau_rut_tien',
        'vi_noi_bo',
        'giao_dich_vi',
        'nhat_ky_hanh_dong',
        'thong_bao',
      ],
    ],
    [
      'hoàn tiền đặc biệt',
      [
        'giao_dich_thanh_toan',
        'vi_noi_bo',
        'lich_su_hoan_tien',
        'giao_dich_vi',
        'nhat_ky_hanh_dong',
        'thong_bao',
      ],
    ],
    [
      'hai bảng 7a không khoá cùng lúc nhưng cùng hạng nên thứ tự nào cũng được',
      ['yeu_cau_rut_tien', 'giao_dich_thanh_toan', 'vi_noi_bo'],
    ],
  ])('%s ⇒ null', (_name, steps) => {
    expect(findLockOrderViolation(steps)).toBeNull();
  });

  it.each([
    [
      'ví trước yêu cầu rút (7b trước 7a)',
      ['vi_noi_bo', 'yeu_cau_rut_tien'],
      { index: 1, truoc: 'vi_noi_bo', sau: 'yeu_cau_rut_tien' },
    ],
    [
      'ví trước giao dịch thanh toán (7b trước 7a)',
      ['vi_noi_bo', 'giao_dich_thanh_toan'],
      { index: 1, truoc: 'vi_noi_bo', sau: 'giao_dich_thanh_toan' },
    ],
    [
      'bảng đối soát trước ví (7c trước 7b)',
      ['lan_doi_soat_nap_vi', 'vi_noi_bo'],
      { index: 1, truoc: 'lan_doi_soat_nap_vi', sau: 'vi_noi_bo' },
    ],
    [
      'sổ ví trước giao dịch thanh toán (7c trước 7a)',
      ['giao_dich_vi', 'giao_dich_thanh_toan'],
      { index: 1, truoc: 'giao_dich_vi', sau: 'giao_dich_thanh_toan' },
    ],
    [
      'yêu cầu rút trước lịch hẹn (7a trước 6)',
      ['yeu_cau_rut_tien', 'lich_hen'],
      { index: 1, truoc: 'yeu_cau_rut_tien', sau: 'lich_hen' },
    ],
    [
      'thông báo trước yêu cầu rút (7c trước 7a)',
      ['thong_bao', 'yeu_cau_rut_tien'],
      { index: 1, truoc: 'thong_bao', sau: 'yeu_cau_rut_tien' },
    ],
  ])('%s', (_name, steps, expected) => {
    expect(findLockOrderViolation(steps)).toEqual(expected);
  });
});

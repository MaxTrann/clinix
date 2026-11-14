import { randomBytes } from 'node:crypto';
import { AUDIT_EXAM_LIMITS, validateAuditEntry } from '../audit-validation.js';
import {
  editRecordEntry,
  hideRatingEntry,
} from '../testing/exam-audit-entries.js';

// doctor-exam P2 (#392) — HDK-09: danh sách trắng của nhật ký có thêm SuaGhiChuKham và AnDanhGia (PLAN 5.12, Q15, Q8).
// Quyết định ngoài PLAN do Đại duyệt 14/11/2026: mỗi khoá của SuaGhiChuKham phải thật sự đổi; ngay_tai_kham_du_kien chỉ nhận null hoặc ngày thật.

const invalid = (input: unknown) =>
  expect(() => validateAuditEntry(input)).toThrow('AUDIT_ENTRY_INVALID');

const TEXT_KEYS = ['trieu_chung', 'chan_doan_so_bo', 'huong_xu_ly'] as const;

/** Entry SuaGhiChuKham với `truoc`/`sau` thay bằng đúng giá trị truyền vào (không ép kiểu: để thử cả giá trị sai). */
const editWith = (truoc: unknown, sau: unknown) => ({
  ...editRecordEntry(),
  changes: { truoc, sau },
});

describe('HDK-09 — hằng giới hạn xuất ra cho B2, B8', () => {
  it('AUDIT_EXAM_LIMITS đúng 2.000 / 10 / 255 [đề xuất chờ Q2, Q8]', () => {
    expect({ ...AUDIT_EXAM_LIMITS }).toEqual({
      examTextMax: 2000,
      hideReasonMin: 10,
      hideReasonMax: 255,
    });
  });
});

describe('HDK-09 — SuaGhiChuKham: chỉ trường có đổi, hai bên cùng tập khoá', () => {
  it('nhận đúng schema và trả bản sao (không phải chính đối tượng vào)', () => {
    const valid = editRecordEntry();
    expect(validateAuditEntry(valid)).toEqual(valid);
    expect(validateAuditEntry(valid)).not.toBe(valid);
  });

  it('nhận 1, 2, 3 và đủ 4 khoá; ngày tái khám đi từ null sang ngày và ngược lại', () => {
    const before = {
      trieu_chung: 'Ho khan',
      chan_doan_so_bo: 'Viêm họng',
      huong_xu_ly: 'Uống nước ấm',
      ngay_tai_kham_du_kien: null,
    };
    const after = {
      trieu_chung: 'Ho có đờm',
      chan_doan_so_bo: 'Viêm phế quản',
      huong_xu_ly: 'Khám lại nếu sốt',
      ngay_tai_kham_du_kien: '2026-12-15',
    };
    const keys = Object.keys(before) as (keyof typeof before)[];
    for (let size = 1; size <= keys.length; size++) {
      const picked = keys.slice(0, size);
      const entry = editWith(
        Object.fromEntries(picked.map((key) => [key, before[key]])),
        Object.fromEntries(picked.map((key) => [key, after[key]])),
      );
      expect(validateAuditEntry(entry)).toEqual(entry);
    }
    // Ngược lại: xoá ngày tái khám (ngày ⇒ null)
    const cleared = editWith(
      { ngay_tai_kham_du_kien: '2026-12-15' },
      { ngay_tai_kham_du_kien: null },
    );
    expect(validateAuditEntry(cleared)).toEqual(cleared);
  });

  it('trần 2.000 đơn vị UTF-16 mỗi trường: đúng 2.000 nhận, 2.001 từ chối (cả phía trước và phía sau)', () => {
    for (const key of TEXT_KEYS) {
      const ok = editWith({ [key]: 'a' }, { [key]: 'b'.repeat(2000) });
      expect(validateAuditEntry(ok)).toEqual(ok);
      const okBefore = editWith({ [key]: 'b'.repeat(2000) }, { [key]: 'a' });
      expect(validateAuditEntry(okBefore)).toEqual(okBefore);
      invalid(editWith({ [key]: 'a' }, { [key]: 'b'.repeat(2001) }));
      invalid(editWith({ [key]: 'b'.repeat(2001) }, { [key]: 'a' }));
    }
  });

  it('chuỗi rỗng được nhận (không đặt luật về rỗng: bắt buộc là việc của DTO ở B2, Q2)', () => {
    const entry = editWith({ huong_xu_ly: 'Nghỉ ngơi' }, { huong_xu_ly: '' });
    expect(validateAuditEntry(entry)).toEqual(entry);
  });

  it('từ chối field thừa ở entry và field thừa, thiếu ở changes', () => {
    invalid({ ...editRecordEntry(), extra: 1 });
    invalid({
      ...editRecordEntry(),
      changes: { ...editRecordEntry().changes, extra: 1 },
    });
    for (const key of ['truoc', 'sau'] as const) {
      const changes: Record<string, unknown> = { ...editRecordEntry().changes };
      delete changes[key];
      invalid({ ...editRecordEntry(), changes });
    }
  });

  // Mọi khoá ở đây đều thuộc bốn trường hợp lệ: lỗi chỉ có thể đến từ việc hai tập khoá lệch nhau hoặc rỗng.
  it.each([
    [
      'sau thiếu một khoá của truoc',
      { trieu_chung: 'x', huong_xu_ly: 'z' },
      { trieu_chung: 'y' },
    ],
    [
      'sau thừa một khoá',
      { trieu_chung: 'x' },
      { trieu_chung: 'y', huong_xu_ly: 'z' },
    ],
    ['cùng số khoá nhưng khác tên', { trieu_chung: 'x' }, { huong_xu_ly: 'y' }],
    ['cả hai rỗng (không có gì đổi)', {}, {}],
    ['truoc rỗng, sau có khoá', {}, { trieu_chung: 'y' }],
    ['sau rỗng, truoc có khoá', { trieu_chung: 'x' }, {}],
  ])(
    'tập khoá truoc/sau phải bằng nhau và không rỗng: %s',
    (_name, truoc, sau) => {
      invalid(editWith(truoc, sau));
    },
  );

  it.each([
    'ho_ten',
    'so_dien_thoai',
    'email',
    'ghi_chu_noi_bo',
    'trieuChung',
    'ngay_tai_kham',
    'ho_so_kham_id',
  ])('khoá ngoài bốn trường bị từ chối (không tên, SĐT, email): %s', (key) => {
    invalid(editWith({ [key]: 'x' }, { [key]: 'y' }));
    // Cả khi lẫn trong tập khoá hợp lệ
    invalid(
      editWith(
        { trieu_chung: 'x', [key]: 'x' },
        { trieu_chung: 'y', [key]: 'y' },
      ),
    );
  });

  it.each([
    ['số', 5],
    ['boolean', true],
    ['mảng', ['a']],
    ['đối tượng', { a: 1 }],
    ['undefined', undefined],
  ])('giá trị không phải string hay null bị từ chối: %s', (_name, value) => {
    invalid(editWith({ trieu_chung: 'x' }, { trieu_chung: value }));
    invalid(editWith({ trieu_chung: value }, { trieu_chung: 'x' }));
  });

  it('mỗi khoá phải thật sự đổi: khoá có giá trị trước bằng sau bị từ chối (Q15, quyết định của Đại 14/11/2026)', () => {
    invalid(editWith({ trieu_chung: 'x' }, { trieu_chung: 'x' }));
    invalid(
      editWith(
        { ngay_tai_kham_du_kien: null },
        { ngay_tai_kham_du_kien: null },
      ),
    );
    // Một khoá đổi, một khoá không đổi: vẫn từ chối (khoá không đổi đưa nội dung khám vào nhật ký vô ích)
    invalid(
      editWith(
        { trieu_chung: 'x', huong_xu_ly: 'giữ nguyên' },
        { trieu_chung: 'y', huong_xu_ly: 'giữ nguyên' },
      ),
    );
  });

  it('ngay_tai_kham_du_kien chỉ nhận null hoặc ngày YYYY-MM-DD có thật (quyết định của Đại 14/11/2026)', () => {
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '15/12/2026',
      '2026-12-15T00:00:00Z',
      '2026-1-5',
      'tuần sau',
      '',
    ])
      invalid(
        editWith(
          { ngay_tai_kham_du_kien: null },
          { ngay_tai_kham_du_kien: bad },
        ),
      );
    // Phía trước cũng phải là ngày thật
    invalid(
      editWith(
        { ngay_tai_kham_du_kien: 'tuần sau' },
        { ngay_tai_kham_du_kien: null },
      ),
    );
    const ok = editWith(
      { ngay_tai_kham_du_kien: '2026-12-15' },
      { ngay_tai_kham_du_kien: '2027-02-28' },
    );
    expect(validateAuditEntry(ok)).toEqual(ok);
  });

  it('chi nhánh của lịch BẮT BUỘC; chỉ nhận đối tượng ho_so_kham', () => {
    invalid(editRecordEntry({ branchId: null }));
    invalid(editRecordEntry({ branchId: '0' }));
    for (const targetType of ['lich_hen', 'danh_gia_bac_si', 'tai_khoan'])
      invalid({ ...editRecordEntry(), targetType });
    invalid({ ...editRecordEntry(), targetId: '0' });
  });

  it('lỗi không chứa nội dung khám (H11): payload sai không để lộ giá trị trong thông điệp', () => {
    const marker = `TRIEU-CHUNG-${randomBytes(6).toString('hex')}`;
    let caught: unknown;
    try {
      validateAuditEntry(
        editWith({ ho_ten: marker }, { ho_ten: `${marker}-sau` }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'AUDIT_ENTRY_INVALID' });
    expect(JSON.stringify(caught).includes(marker)).toBe(false);
    expect(String(caught).includes(marker)).toBe(false);
  });

  it('ghim giới hạn của bộ che (rủi ro cho B2): nội dung khám giống bí mật bị từ chối AUDIT_SENSITIVE_DATA và lỗi không chứa giá trị', () => {
    const marker = randomBytes(8).toString('hex');
    for (const text of [
      `Sốt cao, token=${marker}`,
      `Bearer ${marker}${marker}`,
      `mã băm ${'a'.repeat(64)}`,
    ]) {
      let caught: unknown;
      try {
        validateAuditEntry(
          editWith({ trieu_chung: 'Sốt nhẹ' }, { trieu_chung: text }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
      expect(JSON.stringify(caught).includes(marker)).toBe(false);
    }
  });
});

describe('HDK-09 — AnDanhGia: bi_an false ⇒ true, lý do 10–255, bac_si_id BIGINT', () => {
  const hideWith = (patch: Record<string, unknown>) => ({
    ...hideRatingEntry(),
    changes: { ...hideRatingEntry().changes, ...patch },
  });

  it('nhận đúng schema và trả bản sao (không phải chính đối tượng vào)', () => {
    const valid = hideRatingEntry();
    expect(validateAuditEntry(valid)).toEqual(valid);
    expect(validateAuditEntry(valid)).not.toBe(valid);
  });

  it('từ chối field thừa và thiếu ở entry và ở changes', () => {
    invalid({ ...hideRatingEntry(), extra: 1 });
    invalid(hideWith({ extra: 1 }));
    for (const key of Object.keys(hideRatingEntry().changes)) {
      const changes: Record<string, unknown> = { ...hideRatingEntry().changes };
      delete changes[key];
      invalid({ ...hideRatingEntry(), changes });
    }
  });

  it.each([
    ['truoc.bi_an = true (đã ẩn rồi, cả hai true)', { truoc: { bi_an: true } }],
    [
      'sau.bi_an = false (không ẩn gì, cả hai false)',
      { sau: { bi_an: false } },
    ],
    [
      'đảo ngược true ⇒ false (hiện lại: ngoài phạm vi, Q8)',
      { truoc: { bi_an: true }, sau: { bi_an: false } },
    ],
    ['bi_an là chuỗi "true"', { sau: { bi_an: 'true' } }],
    ['bi_an là số 1', { sau: { bi_an: 1 } }],
    ['truoc.bi_an là số 0', { truoc: { bi_an: 0 } }],
    ['truoc rỗng', { truoc: {} }],
    ['sau thiếu bi_an', { sau: {} }],
    ['truoc thừa khoá', { truoc: { bi_an: false, so_sao: 1 } }],
    ['sau thừa khoá nhận xét', { sau: { bi_an: true, nhan_xet: 'x' } }],
  ])('%s ⇒ AUDIT_ENTRY_INVALID', (_name, patch) => {
    invalid(hideWith(patch));
  });

  it('lý do: trim ≥ 10 và độ dài ≤ 255 (9 ký tự và 9 ký tự có khoảng trắng đệm bị từ chối)', () => {
    for (const reason of [
      '',
      '   ',
      'abcdefghi', // 9 ký tự
      '   abcdefghi   ', // 9 ký tự + đệm: trim còn 9
      'a'.repeat(256),
      `  ${'a'.repeat(254)}`, // 256 tính cả khoảng trắng đầu
      5,
      null,
      ['Nội dung quảng cáo'],
    ])
      invalid(hideWith({ ly_do: reason }));
    for (const reason of [
      'abcdefghij', // đúng 10
      'a'.repeat(255), // đúng 255
      '  Nội dung quảng cáo  ',
    ]) {
      const ok = hideWith({ ly_do: reason });
      expect(validateAuditEntry(ok)).toEqual(ok);
    }
  });

  it.each([
    ['thiếu', undefined],
    ['là số', 5],
    ['"0"', '0'],
    ['rỗng', ''],
    ['có số 0 đứng đầu', '05'],
    ['vượt BIGINT', '9223372036854775808'],
    ['null', null],
  ])('bac_si_id %s ⇒ AUDIT_ENTRY_INVALID', (_name, value) => {
    const entry = hideWith({ bac_si_id: value });
    if (value === undefined)
      delete (entry.changes as Record<string, unknown>).bac_si_id;
    invalid(entry);
  });

  it('bac_si_id lớn nhất của BIGINT được nhận và giữ nguyên dạng chuỗi', () => {
    const ok = hideWith({ bac_si_id: '9223372036854775807' });
    expect(validateAuditEntry(ok)).toEqual(ok);
  });

  it.each(['nhan_xet', 'ho_ten', 'ten_benh_nhan', 'so_dien_thoai', 'email'])(
    'khoá thừa %s (nhận xét, tên, SĐT, email) bị từ chối',
    (key) => {
      invalid(hideWith({ [key]: 'x' }));
    },
  );

  it('chi nhánh của lịch BẮT BUỘC; chỉ nhận đối tượng danh_gia_bac_si', () => {
    invalid(hideRatingEntry({ branchId: null }));
    invalid(hideRatingEntry({ branchId: '0' }));
    for (const targetType of ['ho_so_kham', 'lich_hen', 'tai_khoan'])
      invalid({ ...hideRatingEntry(), targetType });
  });

  it('lỗi không chứa nhận xét hay lý do (H11)', () => {
    const marker = `NHAN-XET-${randomBytes(6).toString('hex')}`;
    let caught: unknown;
    try {
      validateAuditEntry(hideWith({ nhan_xet: marker }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'AUDIT_ENTRY_INVALID' });
    expect(JSON.stringify(caught).includes(marker)).toBe(false);
  });
});

describe('HDK-09 — hành động ngoài tập vẫn bị từ chối rõ', () => {
  it.each(['HienDanhGia', 'XoaGhiChuKham', 'ghichukham', 'suaghichukham', ''])(
    'action %j ⇒ AUDIT_ACTION_UNSUPPORTED (không nhầm với hai hành động mới)',
    (action) => {
      expect(() =>
        validateAuditEntry({ ...editRecordEntry(), action }),
      ).toThrow('AUDIT_ACTION_UNSUPPORTED');
    },
  );
});

import {
  canWriteRecord,
  diffForAudit,
  isAuditedEdit,
  nextRecordTime,
  sameContent,
  tokenMatches,
} from './exam-record.diff.js';
import type { ExamRecordFields } from './exam-record.rules.js';

// doctor-exam B2 — hàm THUẦN so sánh, nhật ký, quyền theo trạng thái, token (PLAN 5.2; Q3, Q15; HSK-12, HSK-13, HSK-17, HSK-25). Không DB, không đồng hồ. Phần MySQL thật: exam-record.int-spec.ts.
const BASE: ExamRecordFields = {
  trieuChung: 'Ho khan',
  chanDoanSoBo: 'Viêm họng cấp',
  huongXuLy: 'Uống đủ nước',
  ngayTaiKhamDuKien: '2026-12-01',
};
const STATES = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
] as const;

describe('HSK-12 sameContent: so bằng `===` trên chuỗi đã chuẩn hoá, KHÔNG theo collation (H2)', () => {
  it('y hệt ⇒ true (kể cả ngày null ở cả hai bên)', () => {
    expect(sameContent(BASE, { ...BASE })).toBe(true);
    expect(
      sameContent(
        { ...BASE, ngayTaiKhamDuKien: null },
        { ...BASE, ngayTaiKhamDuKien: null },
      ),
    ).toBe(true);
  });

  it('khác chỉ hoa/thường, dấu, NFC với NFD, emoji khác nhau, khoảng trắng cuối ⇒ false (MySQL `utf8mb4_unicode_ci` coi các cặp này là BẰNG nhau)', () => {
    const pairs: [string, string][] = [
      ['a', 'A'],
      ['a', 'á'],
      ['á', 'á'],
      ['😀', '😂'],
      ['abc', 'abc '],
      ['abc', 'ａbc'],
    ];
    for (const [before, after] of pairs)
      expect(
        sameContent(
          { ...BASE, trieuChung: before },
          { ...BASE, trieuChung: after },
        ),
        `${before} ≠ ${after}`,
      ).toBe(false);
  });

  it('khác ở từng trường (kể cả ngày thêm, ngày xoá, dòng cũ có chữ null) ⇒ false', () => {
    for (const key of ['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const)
      expect(sameContent(BASE, { ...BASE, [key]: 'khác' })).toBe(false);
    expect(sameContent(BASE, { ...BASE, ngayTaiKhamDuKien: null })).toBe(false);
    expect(sameContent({ ...BASE, ngayTaiKhamDuKien: null }, BASE)).toBe(false);
    expect(sameContent({ ...BASE, trieuChung: null }, BASE)).toBe(false);
  });
});

describe('TDK-04 diffForAudit: chỉ khoá CÓ ĐỔI, snake_case, cùng tập khoá hai bên', () => {
  it('đổi một trường ⇒ đúng một khoá ở truoc và sau', () => {
    expect(diffForAudit(BASE, { ...BASE, huongXuLy: 'Nghỉ ngơi' })).toEqual({
      truoc: { huong_xu_ly: 'Uống đủ nước' },
      sau: { huong_xu_ly: 'Nghỉ ngơi' },
    });
  });

  it('đổi cả bốn ⇒ bốn khoá; thêm ngày (null ⇒ ngày) và xoá ngày (ngày ⇒ null) đều là đổi', () => {
    const all = diffForAudit(BASE, {
      trieuChung: 'a',
      chanDoanSoBo: 'b',
      huongXuLy: 'c',
      ngayTaiKhamDuKien: null,
    });
    expect(Object.keys(all.truoc)).toEqual([
      'trieu_chung',
      'chan_doan_so_bo',
      'huong_xu_ly',
      'ngay_tai_kham_du_kien',
    ]);
    expect(Object.keys(all.sau)).toEqual(Object.keys(all.truoc));
    expect(all.truoc).toMatchObject({ ngay_tai_kham_du_kien: '2026-12-01' });
    expect(all.sau).toMatchObject({ ngay_tai_kham_du_kien: null });
    expect(diffForAudit({ ...BASE, ngayTaiKhamDuKien: null }, BASE)).toEqual({
      truoc: { ngay_tai_kham_du_kien: null },
      sau: { ngay_tai_kham_du_kien: '2026-12-01' },
    });
  });

  it('khoá không đổi KHÔNG xuất hiện (nếu có thì audit từ chối: before !== after); không đổi gì ⇒ hai bên rỗng', () => {
    const diff = diffForAudit(BASE, { ...BASE, chanDoanSoBo: 'Viêm amiđan' });
    expect(Object.keys(diff.truoc)).toEqual(['chan_doan_so_bo']);
    expect(diffForAudit(BASE, { ...BASE })).toEqual({ truoc: {}, sau: {} });
  });

  it('chưa có bản cũ (null) ⇒ mọi trường cũ coi là null (không xảy ra khi isAuditedEdit đúng)', () => {
    expect(diffForAudit(null, { ...BASE, ngayTaiKhamDuKien: null })).toEqual({
      truoc: { trieu_chung: null, chan_doan_so_bo: null, huong_xu_ly: null },
      sau: {
        trieu_chung: 'Ho khan',
        chan_doan_so_bo: 'Viêm họng cấp',
        huong_xu_ly: 'Uống đủ nước',
      },
    });
  });

  it('không có tên, SĐT, email: khoá chỉ thuộc bốn trường hồ sơ', () => {
    const diff = diffForAudit(BASE, {
      trieuChung: 'a',
      chanDoanSoBo: 'b',
      huongXuLy: 'c',
      ngayTaiKhamDuKien: null,
    });
    for (const key of [...Object.keys(diff.truoc), ...Object.keys(diff.sau)])
      expect([
        'trieu_chung',
        'chan_doan_so_bo',
        'huong_xu_ly',
        'ngay_tai_kham_du_kien',
      ]).toContain(key);
  });
});

describe('HSK-17 canWriteRecord và isAuditedEdit cho 7 trạng thái × (có, chưa có hồ sơ)', () => {
  it('canWriteRecord: CHỈ DaTiepDon và HoanThanh', () => {
    expect(STATES.filter(canWriteRecord)).toEqual(['DaTiepDon', 'HoanThanh']);
    expect(canWriteRecord('TrangThaiLa')).toBe(false);
  });

  it('isAuditedEdit: CHỈ HoanThanh VÀ đã có hồ sơ (ghi lần đầu và sửa khi DaTiepDon không nhật ký)', () => {
    const audited = STATES.flatMap((state) =>
      [true, false].map(
        (daCo) => [state, daCo, isAuditedEdit(state, daCo)] as const,
      ),
    ).filter(([, , result]) => result);
    expect(audited).toEqual([['HoanThanh', true, true]]);
  });
});

describe('HSK-13 tokenMatches: sửa chồng theo `capNhatLanCuoi` (so chuỗi ISO)', () => {
  const stored = new Date('2026-11-10T02:00:00.000Z');

  it('chưa có dòng: chỉ token null hợp lệ; token khác null ⇒ không khớp', () => {
    expect(tokenMatches(null, null)).toBe(true);
    expect(tokenMatches('2026-11-10T02:00:00.000Z', null)).toBe(false);
  });

  it('đã có dòng: token phải đúng chuỗi ISO; null, token cũ, định dạng khác ⇒ không khớp', () => {
    expect(tokenMatches('2026-11-10T02:00:00.000Z', stored)).toBe(true);
    expect(tokenMatches(null, stored)).toBe(false);
    expect(tokenMatches('2026-11-10T01:59:59.000Z', stored)).toBe(false);
    expect(tokenMatches('2026-11-10 09:00:00', stored)).toBe(false);
    expect(tokenMatches('2026-11-10T02:00:00Z', stored)).toBe(false);
  });
});

describe('HSK-25 nextRecordTime: max(now, cũ + 1 giây), token đổi sau MỖI lần ghi', () => {
  const now = new Date('2026-11-10T02:00:05.000Z');

  it('lần ghi đầu (chưa có bản cũ) ⇒ now', () => {
    expect(nextRecordTime(now, null)).toEqual(now);
  });

  it('bản cũ ở quá khứ xa (≥ 1 giây trước now) ⇒ now', () => {
    expect(nextRecordTime(now, new Date('2026-11-10T02:00:04.000Z'))).toEqual(
      now,
    );
    expect(nextRecordTime(now, new Date('2026-11-10T01:00:00.000Z'))).toEqual(
      now,
    );
  });

  it('bản cũ BẰNG now (hai ghi cùng giây) ⇒ cũ + 1 giây; bản cũ ĐI TRƯỚC đồng hồ ⇒ cũ + 1 giây', () => {
    expect(nextRecordTime(now, now)).toEqual(
      new Date('2026-11-10T02:00:06.000Z'),
    );
    expect(nextRecordTime(now, new Date('2026-11-10T02:00:07.000Z'))).toEqual(
      new Date('2026-11-10T02:00:08.000Z'),
    );
  });

  it('chuỗi ghi liên tiếp cùng một giây cho các dấu thời gian TĂNG NGHIÊM NGẶT (không bao giờ trùng token)', () => {
    let current: Date | null = null;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      current = nextRecordTime(now, current);
      seen.push(current.getTime());
    }
    expect(seen).toEqual([0, 1, 2, 3, 4].map((n) => now.getTime() + n * 1000));
    expect(new Set(seen).size).toBe(5);
  });

  it('không sửa đối số (trả Date mới khi cần cộng)', () => {
    const old = new Date('2026-11-10T02:00:05.000Z');
    const result = nextRecordTime(now, old);
    expect(result).not.toBe(old);
    expect(old.toISOString()).toBe('2026-11-10T02:00:05.000Z');
  });
});

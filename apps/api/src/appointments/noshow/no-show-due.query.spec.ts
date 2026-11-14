import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { notOverriddenSql } from '../lists/appointment-history.reader.js';
import {
  countUnattended,
  DUE_FROM_SQL,
  DUE_WHERE_SQL,
  dueParams,
  findNoShowCandidates,
  isNoShowDue,
  SHIFT_END_SQL,
} from './no-show-due.query.js';

// Task B13 — NSQ-01 (PLAN booking 7.35 `[đề xuất]`; TRACKING 3.29 B13-D, B13-H) và phần HÌNH DẠNG CÂU của NSQ-04: mệnh đề "ca đã kết thúc" là MỘT hằng, dùng nguyên văn ở câu chọn ứng viên và ở câu kiểm lại dưới khoá,
// `now` luôn là tham số, đọc thường (không khoá). Không DB: kết quả trên dữ liệu thật (NSQ-02, NSQ-03, phần dữ liệu của NSQ-04) nằm ở no-show-due.query.int-spec.ts.
const NOW = new Date('2026-11-10T12:00:00+07:00');

function fakeEm(rows: unknown = []) {
  const query = vi
    .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
    .mockResolvedValue(rows);
  return { em: { query } as unknown as EntityManager, query };
}

const sqlOf = (query: ReturnType<typeof fakeEm>['query'], call = 0): string =>
  query.mock.calls[call]?.[0] ?? '';
const paramsOf = (
  query: ReturnType<typeof fakeEm>['query'],
  call = 0,
): unknown[] => query.mock.calls[call]?.[1] ?? [];

/** Ba câu SQL của file, mỗi câu một lần gọi (câu chọn lô đầu, câu chọn có con trỏ, câu kiểm lại, câu đếm) */
async function allSql(): Promise<string[]> {
  const sqls: string[] = [];
  for (const run of [
    (em: EntityManager) =>
      findNoShowCandidates(em, { now: NOW, afterId: null, limit: 100 }),
    (em: EntityManager) =>
      findNoShowCandidates(em, { now: NOW, afterId: '57', limit: 100 }),
    (em: EntityManager) => isNoShowDue(em, '41', NOW),
    (em: EntityManager) => countUnattended(em, NOW),
  ]) {
    const { em, query } = fakeEm();
    await run(em);
    sqls.push(sqlOf(query));
  }
  return sqls;
}

describe('NSQ-01 mệnh đề "ca đã kết thúc" là MỘT hằng dùng nguyên văn ở hai câu', () => {
  it('câu chọn ứng viên (có và không con trỏ) và câu kiểm lại dưới khoá đều chứa NGUYÊN VĂN DUE_FROM_SQL và DUE_WHERE_SQL', async () => {
    const [first, withCursor, due] = await allSql();
    for (const sql of [first, withCursor, due]) {
      expect(sql).toContain(DUE_FROM_SQL);
      expect(sql).toContain(DUE_WHERE_SQL);
      // B18: mảnh "chưa từng override" nằm TRONG mệnh đề chung, nên cả hai câu có nó (NSO-01)
      expect(sql).toContain(notOverriddenSql('lh'));
    }
  });

  it('hằng đúng chữ: chỉ DaXacNhan, cắt sớm giờ hẹn, TIMESTAMP(ngày ca, giờ kết thúc) <= now nửa mở, hai dấu `?`', () => {
    expect(DUE_WHERE_SQL).toContain("lh.trang_thai = 'DaXacNhan'");
    expect(DUE_WHERE_SQL).toContain('lh.thoi_gian <= ?');
    expect(DUE_WHERE_SQL).toContain(
      `TIMESTAMP(llv.ngay, ${SHIFT_END_SQL}) <= ?`,
    );
    expect(DUE_WHERE_SQL).not.toMatch(/<\s*\?(?!\s*=)/); // không có `<` thuần: giờ kết thúc là đã kết thúc (VM-02)
    expect(DUE_WHERE_SQL.match(/\?/g)).toHaveLength(2);
    expect(dueParams(NOW)).toEqual([NOW, NOW]);
  });

  it('giờ kết thúc ca: CaSang lấy gio_ket_thuc_sang, CaChieu lấy gio_ket_thuc_chieu, mọi ca khác (CaToi) ra NULL (không nhánh ELSE)', () => {
    expect(SHIFT_END_SQL).toContain("WHEN 'CaSang' THEN cn.gio_ket_thuc_sang");
    expect(SHIFT_END_SQL).toContain(
      "WHEN 'CaChieu' THEN cn.gio_ket_thuc_chieu",
    );
    expect(SHIFT_END_SQL).not.toMatch(/\bELSE\b/);
    expect(SHIFT_END_SQL).not.toContain('CaToi');
  });

  it('nối: chi nhánh CỦA CA (llv.chi_nhanh_id, không phải của lịch), thứ ISO bằng WEEKDAY(ngày) + 1, khung giờ rồi ca', () => {
    expect(DUE_FROM_SQL).toContain('cn.chi_nhanh_id = llv.chi_nhanh_id');
    expect(DUE_FROM_SQL).toContain('cn.thu_trong_tuan = WEEKDAY(llv.ngay) + 1');
    expect(DUE_FROM_SQL).toContain('kg.khung_gio_id = lh.khung_gio_id');
    expect(DUE_FROM_SQL).toContain(
      'llv.lich_lam_viec_id = kg.lich_lam_viec_id',
    );
    expect(DUE_FROM_SQL).not.toContain('lh.chi_nhanh_id');
  });

  it('mọi câu: không NOW(), CURDATE(), không bọc thoi_gian bằng DATE(), không mệnh đề khoá (đọc thường)', async () => {
    for (const sql of await allSql()) {
      expect(sql).not.toMatch(/\bNOW\s*\(/i);
      expect(sql).not.toMatch(/\bCURDATE\s*\(/i);
      expect(sql).not.toMatch(/\bDATE\s*\([^)]*thoi_gian/i);
      expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
      expect(sql).not.toMatch(/LOCK\s+IN\s+SHARE/i);
    }
  });
});

// Task B18 — NSO-01 (PLAN booking 7.46 `[đề xuất]`; TRACKING 3.40 B18-D, B18-F): lịch ĐÃ TỪNG được Quản trị viên override thành công không đến hạn tự Vắng mặt. Mảnh SQL do reader xuất (AR-08), nằm trong MỘT mệnh đề
// dùng chung cho câu ứng viên (lọc TRƯỚC `LIMIT`) và câu kiểm lại dưới khoá (không khoá mới). Kết quả trên dữ liệu thật: NSO-03…NSO-08 ở các int-spec.
describe('NSO-01 mảnh "chưa từng override" nằm trong mệnh đề chung, đủ bốn điều kiện, đọc thường', () => {
  const fragment = notOverriddenSql('lh');

  it('DUE_WHERE_SQL chứa NGUYÊN VĂN mảnh; DUE_FROM_SQL và câu đếm ca không có khoảng KHÔNG đụng bảng nhật ký', async () => {
    expect(DUE_WHERE_SQL).toContain(fragment);
    expect(DUE_FROM_SQL).not.toContain('nhat_ky_hanh_dong');
    const { em, query } = fakeEm([{ n: 0 }]);
    await countUnattended(em, NOW);
    expect(sqlOf(query)).not.toContain('nhat_ky_hanh_dong');
    expect(sqlOf(query)).not.toContain('NOT EXISTS');
  });

  it('mảnh là NOT EXISTS tương quan với `lh.lich_hen_id` và có đủ bốn điều kiện: đối tượng lich_hen, đúng `ma_doi_tuong`, hành động OverrideLichHen, kết quả ThanhCong', () => {
    const text = fragment.replace(/\s+/g, ' ');
    expect(text).toMatch(/^NOT EXISTS \(SELECT 1 FROM nhat_ky_hanh_dong nk /);
    expect(text).toContain("nk.loai_doi_tuong = 'lich_hen'");
    expect(text).toContain('nk.ma_doi_tuong = lh.lich_hen_id');
    expect(text).toContain("nk.hanh_dong = 'OverrideLichHen'");
    expect(text).toContain("nk.ket_qua = 'ThanhCong'");
  });

  it('không bọc cột (AR-05: giữ chỉ mục nhat_ky_hanh_dong_index_29 dùng được), không `?` (danh sách tham số của job không đổi), không NOW() (AR-04), không mệnh đề khoá', () => {
    expect(fragment).not.toMatch(/\b(CAST|CONVERT|DATE|LOWER|UPPER)\s*\(/i);
    expect(fragment).not.toContain('?');
    expect(fragment).not.toMatch(/\bNOW\s*\(/i);
    expect(fragment).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
    expect(fragment).not.toMatch(/LOCK\s+IN\s+SHARE/i);
    expect(DUE_WHERE_SQL.match(/\?/g)).toHaveLength(2);
    expect(dueParams(NOW)).toEqual([NOW, NOW]);
  });

  it('bí danh của lịch do người gọi truyền (không cứng `lh`)', () => {
    expect(notOverriddenSql('x')).toContain('nk.ma_doi_tuong = x.lich_hen_id');
    expect(notOverriddenSql('x')).not.toContain('lh.');
  });
});

describe('NSQ-01 câu chọn ứng viên: thứ tự, con trỏ, tham số', () => {
  it('lô đầu: tham số [now, now, limit], không cận con trỏ, ORDER BY khoá chính rồi LIMIT', async () => {
    const { em, query } = fakeEm([{ lichHenId: '3' }, { lichHenId: '9' }]);
    const ids = await findNoShowCandidates(em, {
      now: NOW,
      afterId: null,
      limit: 100,
    });
    expect(ids).toEqual(['3', '9']);
    expect(paramsOf(query)).toEqual([NOW, NOW, 100]);
    expect(sqlOf(query)).not.toContain('lh.lich_hen_id > ?');
    expect(sqlOf(query)).toMatch(/ORDER BY lh\.lich_hen_id LIMIT \?$/);
    expect(sqlOf(query)).toContain(
      'SELECT CAST(lh.lich_hen_id AS CHAR) AS lichHenId',
    );
  });

  it('lô sau: cận `lh.lich_hen_id > ?` đứng SAU mệnh đề chung và TRƯỚC ORDER BY; tham số [now, now, afterId, limit]', async () => {
    const { em, query } = fakeEm();
    await findNoShowCandidates(em, { now: NOW, afterId: '57', limit: 100 });
    expect(paramsOf(query)).toEqual([NOW, NOW, '57', 100]);
    const sql = sqlOf(query);
    expect(sql.indexOf(DUE_WHERE_SQL)).toBeLessThan(
      sql.indexOf('lh.lich_hen_id > ?'),
    );
    expect(sql.indexOf('lh.lich_hen_id > ?')).toBeLessThan(
      sql.indexOf('ORDER BY lh.lich_hen_id LIMIT ?'),
    );
  });

  it('không ứng viên: danh sách rỗng', async () => {
    const { em } = fakeEm([]);
    await expect(
      findNoShowCandidates(em, { now: NOW, afterId: null, limit: 100 }),
    ).resolves.toEqual([]);
  });
});

describe('NSQ-01 câu kiểm lại dưới khoá (isNoShowDue)', () => {
  it('tra theo khoá chính của lịch rồi mệnh đề chung; tham số [lichHenId, now, now]; LIMIT 1', async () => {
    const { em, query } = fakeEm([{ due: 1 }]);
    await expect(isNoShowDue(em, '41', NOW)).resolves.toBe(true);
    expect(paramsOf(query)).toEqual(['41', NOW, NOW]);
    expect(sqlOf(query)).toContain(
      `WHERE lh.lich_hen_id = ? AND ${DUE_WHERE_SQL}`,
    );
    expect(sqlOf(query)).toMatch(/LIMIT 1$/);
  });

  it('không có hàng (chưa đến hạn, đã đổi trạng thái, ca không có khoảng): false', async () => {
    const { em } = fakeEm([]);
    await expect(isNoShowDue(em, '41', NOW)).resolves.toBe(false);
  });
});

describe('NSQ-04 (hình dạng câu; dữ liệu ở int-spec) câu đếm ca không có khoảng', () => {
  it('chỉ DaXacNhan đã quá giờ hẹn, giờ kết thúc NULL, LEFT JOIN lịch hoạt động (gồm chi nhánh thiếu dòng), tham số [now]', async () => {
    const { em, query } = fakeEm([{ n: '7' }]);
    await expect(countUnattended(em, NOW)).resolves.toBe(7);
    const sql = sqlOf(query);
    expect(paramsOf(query)).toEqual([NOW]);
    expect(sql).toContain("lh.trang_thai = 'DaXacNhan' AND lh.thoi_gian <= ?");
    expect(sql).toContain('LEFT JOIN chi_nhanh_lich_hoat_dong cn ON');
    expect(sql).toContain(`${SHIFT_END_SQL} IS NULL`);
    expect(sql).not.toContain('TIMESTAMP(');
  });

  it('số đếm là SỐ dù driver trả chuỗi hay số; không hàng thì 0', async () => {
    await expect(countUnattended(fakeEm([{ n: 3 }]).em, NOW)).resolves.toBe(3);
    await expect(countUnattended(fakeEm([{ n: '0' }]).em, NOW)).resolves.toBe(
      0,
    );
    await expect(countUnattended(fakeEm([]).em, NOW)).resolves.toBe(0);
  });
});

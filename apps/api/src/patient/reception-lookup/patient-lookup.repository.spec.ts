import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { buildLookupPatterns } from '../validation/keyword-policy.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';

// Task B6 — HÌNH DẠNG câu SQL của tra cứu bệnh nhân, đọc bằng EntityManager giả ghi lại câu lệnh và tham số (PLAN patient 5.4; TRACKING B6-E, B6-G).
// Hành vi thật trên MySQL: patient-lookup.int-spec.ts. Mã ca PLR-nn là [đề xuất]. Câu SQL được chuẩn hoá khoảng trắng trước khi so.
const repository = new PatientLookupRepository();

interface Call {
  sql: string;
  params: unknown[];
}

function fakeManager(rows: unknown[]) {
  const calls: Call[] = [];
  const query = vi.fn((sql: string, params: unknown[]) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return Promise.resolve(rows);
  });
  return { em: { query } as unknown as EntityManager, calls };
}

const TEXT = buildLookupPatterns('nguyen');
const DIGITS = buildLookupPatterns('0901 234');

async function bothStatements(patterns = TEXT) {
  const counting = fakeManager([{ total: '0' }]);
  await repository.count(counting.em, patterns);
  const paging = fakeManager([]);
  await repository.findPage(paging.em, patterns, 20, 0);
  return { count: counting.calls[0]!, page: paging.calls[0]! };
}

describe('PatientLookupRepository — hình dạng SQL', () => {
  it('PLR-01 (H4) cả hai câu chỉ nhắc tai_khoan và benh_nhan: không lich_hen, le_tan, vi_noi_bo, ma_xac_thuc, phien_dang_nhap, nhat_ky_hanh_dong, ho_so_nguoi_than', async () => {
    for (const patterns of [TEXT, DIGITS]) {
      const { count, page } = await bothStatements(patterns);
      for (const { sql } of [count, page]) {
        const tables = [...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map(
          (m) => m[1],
        );
        expect(tables).toStrictEqual(['tai_khoan', 'benh_nhan']);
        for (const other of [
          'lich_hen',
          'le_tan',
          'vi_noi_bo',
          'ma_xac_thuc',
          'phien_dang_nhap',
          'nhat_ky_hanh_dong',
          'ho_so_nguoi_than',
          'bac_si',
          'quan_tri_vien',
        ]) {
          expect(sql).not.toContain(other);
        }
      }
    }
  });

  it("PLR-02 (TC-07, TC-08) INNER JOIN benh_nhan, loai_tai_khoan = 'BenhNhan', KHÔNG lọc trang_thai trong WHERE; chỉ đọc: không khoá, không ghi, không SELECT *", async () => {
    const { count, page } = await bothStatements();
    for (const { sql } of [count, page]) {
      expect(sql).toContain(
        'FROM tai_khoan t INNER JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id',
      );
      expect(sql).toContain("t.loai_tai_khoan = 'BenhNhan'");
      expect(sql).not.toMatch(/LEFT\s+JOIN/i);
      const where = sql.slice(sql.indexOf('WHERE'));
      expect(where).not.toContain('trang_thai');
      expect(sql).not.toMatch(/FOR\s+(UPDATE|SHARE)|LOCK\s+IN/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE\s+INTO)\b/i);
      expect(sql).not.toContain('SELECT *');
      expect(sql).not.toMatch(/\bt\.\*|\bb\.\*/);
    }
  });

  it("PLR-03 (TC-05) mỗi LIKE đi cùng ESCAPE '!'; ba điều kiện khi nhánh SĐT bật, hai khi tắt; tham số theo thứ tự họ tên, email, [SĐT], giới hạn, độ lệch; không nối giá trị vào câu SQL", async () => {
    const off = await bothStatements(TEXT);
    const on = await bothStatements(DIGITS);

    for (const { sql } of [off.count, off.page, on.count, on.page]) {
      expect((sql.match(/\bLIKE\b/g) ?? []).length).toBe(
        (sql.match(/ESCAPE '!'/g) ?? []).length,
      );
    }
    expect((off.count.sql.match(/\bLIKE\b/g) ?? []).length).toBe(2);
    expect((on.count.sql.match(/\bLIKE\b/g) ?? []).length).toBe(3);
    expect(off.count.params).toStrictEqual([TEXT.name, TEXT.email]);
    expect(off.page.params).toStrictEqual([TEXT.name, TEXT.email, 20, 0]);
    expect(on.count.params).toStrictEqual([
      DIGITS.name,
      DIGITS.email,
      DIGITS.phone,
    ]);
    expect(on.page.params).toStrictEqual([
      DIGITS.name,
      DIGITS.email,
      DIGITS.phone,
      20,
      0,
    ]);
    expect(on.page.sql).not.toContain('0901');
    expect(on.count.sql).toContain('t.so_dien_thoai LIKE ?');
    expect(off.count.sql).not.toContain('so_dien_thoai');
  });

  it('PLR-04 chuỗi điều kiện (từ FROM tới hết nhóm OR) của câu đếm và câu trang GIỐNG HỆT, nên total đếm đúng tập mà trang cắt ra', async () => {
    for (const patterns of [TEXT, DIGITS]) {
      const { count, page } = await bothStatements(patterns);
      const conditionOf = (sql: string) =>
        sql
          .slice(
            sql.indexOf('FROM'),
            sql.includes('ORDER BY') ? sql.indexOf('ORDER BY') : undefined,
          )
          .trim();
      expect(conditionOf(count.sql)).toBe(conditionOf(page.sql));
    }
  });

  it('PLR-05 (TC-09) câu trang ORDER BY t.ho_ten ASC, t.tai_khoan_id ASC rồi LIMIT ? OFFSET ?; câu đếm là COUNT(*) không ORDER BY, không LIMIT', async () => {
    const { count, page } = await bothStatements();
    expect(page.sql).toMatch(
      /ORDER BY t\.ho_ten ASC, t\.tai_khoan_id ASC LIMIT \? OFFSET \?$/,
    );
    expect(count.sql).toMatch(/^SELECT COUNT\(\*\) AS total FROM/);
    expect(count.sql).not.toMatch(/ORDER BY|LIMIT|OFFSET/);
  });

  it("PLR-06 (TC-01) họ tên so sau HAI lớp REPLACE ('đ' rồi 'Đ'); email và SĐT KHÔNG qua REPLACE", async () => {
    const { count, page } = await bothStatements(DIGITS);
    for (const { sql } of [count, page]) {
      expect(sql).toContain(
        "REPLACE(REPLACE(t.ho_ten, 'đ', 'd'), 'Đ', 'D') LIKE ? ESCAPE '!'",
      );
      expect((sql.match(/REPLACE\(/g) ?? []).length).toBe(2);
      expect(sql).toContain("t.email LIKE ? ESCAPE '!'");
      expect(sql).toContain("t.so_dien_thoai LIKE ? ESCAPE '!'");
    }
  });

  it('PLR-07 (TC-10) cột trang đúng năm bí danh taiKhoanId, hoTen, soDienThoai, email, trangThai; ánh xạ chỉ giữ năm khoá dù hàng thô có cột thừa; id chuỗi lớn hơn 2^53 nguyên vẹn', async () => {
    const { page } = await bothStatements();
    const select = page.sql.slice(0, page.sql.indexOf(' FROM '));
    expect([...select.matchAll(/ AS (\w+)/g)].map((m) => m[1])).toStrictEqual([
      'taiKhoanId',
      'hoTen',
      'soDienThoai',
      'email',
      'trangThai',
    ]);

    const raw = {
      taiKhoanId: '9007199254740993',
      hoTen: 'Nguyễn Văn Thử',
      soDienThoai: '0901234567',
      email: 'thu@example.invalid',
      trangThai: 'NgungHoatDong',
      matKhauBam: 'khong-duoc-lo',
      soLanNoShow: 3,
    };
    const { em } = fakeManager([raw]);

    const [item] = await repository.findPage(em, TEXT, 20, 0);

    expect(item).toStrictEqual({
      taiKhoanId: '9007199254740993',
      hoTen: 'Nguyễn Văn Thử',
      soDienThoai: '0901234567',
      email: 'thu@example.invalid',
      trangThai: 'NgungHoatDong',
    });
  });

  it('PLR-08 count: COUNT(*) của driver ra chuỗi (BIGINT) ⇒ số; không hàng ⇒ 0', async () => {
    expect(
      await repository.count(fakeManager([{ total: '6250' }]).em, TEXT),
    ).toBe(6250);
    expect(await repository.count(fakeManager([{ total: 3 }]).em, TEXT)).toBe(
      3,
    );
    expect(await repository.count(fakeManager([]).em, TEXT)).toBe(0);
  });
});

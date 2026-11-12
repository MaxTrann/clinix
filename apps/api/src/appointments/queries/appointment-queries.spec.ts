import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../../doctor/testing/architecture-scan.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import { AppointmentQueries } from './appointment-queries.js';

// Task B11 — AFL-03 (PLAN booking 7.30; TRACKING 3.24.3): `AppointmentQueries` CHỈ ĐỌC. Quét nguồn của thư mục `queries/` (không DB) rồi kiểm lớp uỷ quyền đủ ba hàm và không tiêm gì. Phần ánh xạ danh
// sách trắng của `listAffectedByLeave` ở affected-by-leave.query.spec.ts (AFL-03 đơn vị); số câu và "không khoá, không ghi" trên MySQL thật là AFL-04.
const QUERIES_DIR = fileURLToPath(new URL('.', import.meta.url));

const sources = readdirSync(QUERIES_DIR)
  .filter(
    (name) => name.endsWith('.ts') && !/\.(?:spec|int-spec)\.ts$/.test(name),
  )
  .map((name) => ({
    name,
    code: stripComments(readFileSync(`${QUERIES_DIR}${name}`, 'utf8')),
  }));

describe('AFL-03 queries/ chỉ đọc: không khoá, không ghi, không đọc đồng hồ của DB, không bọc cột chỉ mục', () => {
  it('thư mục có đúng ba file mã (lớp và hai câu đọc), để bộ quét bên dưới không quét hụt', () => {
    expect(sources.map(({ name }) => name).sort()).toEqual([
      'active-by-shifts.query.ts',
      'affected-by-leave.query.ts',
      'appointment-queries.ts',
    ]);
  });

  it.each([
    ['mệnh đề khoá FOR UPDATE', /\bFOR\s+UPDATE\b/i],
    ['mệnh đề khoá FOR SHARE', /\bFOR\s+SHARE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i],
    ['INSERT', /\b(?:INSERT|REPLACE)\b/i],
    ['UPDATE', /\bUPDATE\b/i],
    ['DELETE', /\bDELETE\b/i],
    ['TRUNCATE', /\bTRUNCATE\b/i],
    ['DATE() quanh cột', /\bDATE\s*\(/i],
    [
      'hàm giờ của DB',
      /\b(?:NOW|CURDATE|CURTIME|SYSDATE|UTC_TIMESTAMP)\s*\(|\bCURRENT_(?:DATE|TIMESTAMP)\b/i,
    ],
    [
      'ghi thực thể (save, update, insert, remove…) qua repository',
      /\.\s*(?:save|insert|remove|softDelete|upsert|increment|decrement)\s*\(/,
    ],
  ])('không có %s trong mã của queries/', (_ten, pattern) => {
    for (const { name, code } of sources)
      expect(pattern.test(code), `${name} khớp ${pattern.source}`).toBe(false);
  });

  it('bộ quét THẤY thứ nó cần thấy: các câu đọc có FROM lich_hen và thoi_gian (nếu không, các kiểm "không có" ở trên là vô nghĩa)', () => {
    const all = sources.map(({ code }) => code).join('\n');
    expect(all).toMatch(/FROM lich_hen lh/);
    expect(all).toMatch(/lh\.thoi_gian >/);
    expect(all).toMatch(/GROUP BY/);
  });
});

describe('AFL-03 AppointmentQueries: lớp uỷ quyền, không tiêm gì', () => {
  it('dựng được không đối số (không phụ thuộc gì để tiêm) và có đủ ba hàm D5, D13, D14', () => {
    const queries = new AppointmentQueries();
    expect(AppointmentQueries.length).toBe(0);
    expect(typeof queries.findAffectedByLeave).toBe('function');
    expect(typeof queries.listAffectedByLeave).toBe('function');
    expect(typeof queries.countActiveByShifts).toBe('function');
  });

  it('mỗi hàm chạy đúng câu của file câu đọc tương ứng trên `em` của người gọi (không mở giao dịch, không dùng kết nối khác)', async () => {
    const queries = new AppointmentQueries();
    const em = new ScriptedEntityManager((sql) =>
      sql.includes('COUNT(*) AS tong')
        ? [{ tong: 1, soBenhNhan: 1, soCoCoc: 0 }]
        : [],
    );
    const filter = {
      bacSiId: '9',
      tuNgay: '2026-11-10',
      denNgay: '2026-11-12',
      now: new Date('2026-11-10T09:00:00+07:00'),
    };
    await queries.findAffectedByLeave(em.em, filter);
    await queries.listAffectedByLeave(em.em, { ...filter, limit: 3 });
    await queries.countActiveByShifts(em.em, { lichLamViecIds: ['3'] });
    expect(em.labels).toEqual([
      'read lich_hen',
      'read lich_hen',
      'read lich_hen',
      'read khung_gio',
    ]);
  });
});

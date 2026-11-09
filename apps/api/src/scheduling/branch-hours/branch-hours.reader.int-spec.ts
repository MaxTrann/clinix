import { vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BranchHoursReader, hoursKey } from './branch-hours.reader.js';
import { isoWeekdayOf } from './time-of-day.js';

// Doctor P2 trên MySQL 8.4 THẬT: GC-13 (BranchHoursReader) và PC-26 (M5: thứ ISO của hàm thuần = WEEKDAY()+1).
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const reader = new BranchHoursReader();

describe('BranchHoursReader trên MySQL thật', () => {
  it('GC-13 load: TIME ⇒ giây; thứ nghỉ ⇒ hoatDong=false; thứ không có dòng ⇒ null', async () => {
    const branch = await fx.branch();
    await db.query(
      `INSERT INTO chi_nhanh_lich_hoat_dong
         (chi_nhanh_id, thu_trong_tuan, hoat_dong, gio_bat_dau_sang, gio_ket_thuc_sang, gio_bat_dau_chieu, gio_ket_thuc_chieu)
       VALUES (?, 1, true, '07:30:00', '11:00:00', '13:00:00', '16:59:59'),
              (?, 2, true, '08:00:00', '12:00:00', NULL, NULL),
              (?, 7, false, NULL, NULL, NULL, NULL)`,
      [branch.chiNhanhId, branch.chiNhanhId, branch.chiNhanhId],
    );
    const load = (thu: number) =>
      reader.load(db.manager, branch.chiNhanhId, thu);

    expect(await load(1)).toEqual({
      hoatDong: true,
      sang: { tuGiay: 27000, denGiay: 39600 },
      chieu: { tuGiay: 46800, denGiay: 61199 },
    });
    expect(await load(2)).toEqual({
      hoatDong: true,
      sang: { tuGiay: 28800, denGiay: 43200 },
      chieu: null,
    });
    expect(await load(7)).toEqual({ hoatDong: false, sang: null, chieu: null });
    expect(await load(3)).toBeNull(); // chưa khai báo
  });

  it('GC-13 load: không lẫn chi nhánh khác', async () => {
    const a = await fx.branch();
    const b = await fx.branch();
    await fx.weeklySchedule(a.chiNhanhId);
    expect(await reader.load(db.manager, b.chiNhanhId, 1)).toBeNull();
    expect(await reader.load(db.manager, a.chiNhanhId, 1)).not.toBeNull();
  });

  it('GC-13 loadMany: MỘT truy vấn cho nhiều cặp (chi nhánh, thứ), cặp thiếu ⇒ null, cặp trùng gộp một, danh sách rỗng ⇒ không truy vấn', async () => {
    const a = await fx.branch();
    const b = await fx.branch();
    await fx.weeklySchedule(a.chiNhanhId);
    const spy = vi.spyOn(db.manager, 'query');

    const result = await reader.loadMany(db.manager, [
      { chiNhanhId: a.chiNhanhId, thuTrongTuan: 1 },
      { chiNhanhId: a.chiNhanhId, thuTrongTuan: 1 },
      { chiNhanhId: a.chiNhanhId, thuTrongTuan: 5 },
      { chiNhanhId: b.chiNhanhId, thuTrongTuan: 1 },
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(3);
    expect(
      result.get(hoursKey({ chiNhanhId: a.chiNhanhId, thuTrongTuan: 5 })),
    ).toEqual({
      hoatDong: true,
      sang: { tuGiay: 28800, denGiay: 43200 },
      chieu: { tuGiay: 46800, denGiay: 61200 },
    });
    expect(
      result.get(hoursKey({ chiNhanhId: b.chiNhanhId, thuTrongTuan: 1 })),
    ).toBeNull();

    spy.mockClear();
    expect((await reader.loadMany(db.manager, [])).size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('thứ ISO so với MySQL', () => {
  it('PC-26 (M5) mọi ngày của năm 2026: isoWeekdayOf = WEEKDAY() + 1 của MySQL', async () => {
    const rows: { ngay: string; thu: number | string }[] = await db.query(
      `WITH RECURSIVE d AS (
         SELECT DATE('2026-01-01') AS ngay
         UNION ALL SELECT ngay + INTERVAL 1 DAY FROM d WHERE ngay < '2026-12-31'
       )
       SELECT DATE_FORMAT(ngay, '%Y-%m-%d') AS ngay, WEEKDAY(ngay) + 1 AS thu FROM d`,
    );
    expect(rows).toHaveLength(365);
    const mismatches = rows.filter(
      (row) => isoWeekdayOf(row.ngay) !== Number(row.thu),
    );
    expect(mismatches).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import {
  incrementNoShow,
  lockNoShowCounter,
  readNoShowCounter,
  setNoShowLock,
} from './no-show-counter.query.js';
import { setStatus } from './set-status.query.js';
import { windowOf } from './status-config.js';

// Task B12 — NSH-02 (ngữ cảnh cửa sổ) và NSH-03 (hình dạng câu SQL) mức hàm nhỏ (PLAN 7.32 `[đề xuất]`; TRACKING 3.26 B12-D): các hàm nhỏ của `checkIn` và `markNoShow` với `EntityManager` GIẢ (không DB): `windowOf` (ngữ cảnh cửa sổ cho ma trận), `setStatus` (`UPDATE lich_hen`
// chung) và bốn câu của bộ đếm no-show. Câu thật trên MySQL: `mark-no-show.int-spec.ts`, `check-in.int-spec.ts`.
const NOW = new Date('2026-11-10T08:00:00+07:00');
const THOI_GIAN = new Date('2026-11-10T09:00:00+07:00');

describe('NSH-02 windowOf: ngữ cảnh cửa sổ tiếp đón cho ma trận (Q22)', () => {
  it('chưa có cấu hình (null) ⇒ undefined: ma trận từ chối ThieuDuLieu, không đoán số phút', () => {
    expect(windowOf(null, NOW, THOI_GIAN)).toBeUndefined();
  });

  it('có cấu hình ⇒ now, thoiGian giữ nguyên; số phút lấy từ checkInTruocPhut và checkInSauPhut (không lẫn nguongNoShow)', () => {
    expect(
      windowOf(
        { checkInTruocPhut: 30, checkInSauPhut: 15, nguongNoShow: 9 },
        NOW,
        THOI_GIAN,
      ),
    ).toEqual({ now: NOW, thoiGian: THOI_GIAN, truocPhut: 30, sauPhut: 15 });
  });

  it('không sửa đầu vào (Date mới không bị đổi)', () => {
    const now = new Date(NOW);
    windowOf(
      { checkInTruocPhut: 0, checkInSauPhut: 0, nguongNoShow: 1 },
      now,
      THOI_GIAN,
    );
    expect(now.getTime()).toBe(NOW.getTime());
  });
});

describe('NSH-03 setStatus: một UPDATE có điều kiện trạng thái nguồn', () => {
  const run = (answer: unknown) => {
    const em = new ScriptedEntityManager(() => answer);
    return {
      em,
      set: () =>
        setStatus(em.em, { lichHenId: '41', from: 'DaXacNhan', to: 'VangMat' }),
    };
  };

  it('tham số theo đúng thứ tự (đích, lịch, nguồn); đúng 1 hàng ⇒ true', async () => {
    const { em, set } = run({ affectedRows: 1 });
    expect(await set()).toBe(true);
    expect(em.queries[0]?.sql).toMatch(
      /^UPDATE lich_hen SET trang_thai = \?\s+WHERE lich_hen_id = \? AND trang_thai = \?/,
    );
    expect(em.queries[0]?.params).toEqual(['VangMat', '41', 'DaXacNhan']);
  });

  it.each([{ affectedRows: 0 }, { affectedRows: 2 }, {}])(
    'kết quả %j (không đúng 1 hàng) ⇒ false',
    async (answer) => {
      expect(await run(answer).set()).toBe(false);
    },
  );
});

describe('NSH-03 bộ đếm no-show: bốn câu, tra theo khoá chính tai_khoan_id', () => {
  const one = (rows: unknown, result: unknown = { affectedRows: 1 }) =>
    new ScriptedEntityManager((sql) =>
      sql.startsWith('UPDATE') ? result : rows,
    );

  it('lockNoShowCounter: SELECT … FOR UPDATE theo tai_khoan_id; số và cờ đổi sang kiểu đúng dù driver trả chuỗi hay số', async () => {
    const em = one([{ soLan: '2', khoa: 1 }]);
    expect(await lockNoShowCounter(em.em, '77')).toEqual({
      soLan: 2,
      khoa: true,
    });
    expect(em.queries[0]?.sql).toMatch(/WHERE tai_khoan_id = \?\s+FOR UPDATE$/);
    expect(em.queries[0]?.params).toEqual(['77']);
    expect(em.labels).toEqual(['lock benh_nhan']);
  });

  it.each([
    [
      { soLan: 0, khoa: 0 },
      { soLan: 0, khoa: false },
    ],
    [
      { soLan: '0', khoa: '0' },
      { soLan: 0, khoa: false },
    ],
    [
      { soLan: 7, khoa: '1' },
      { soLan: 7, khoa: true },
    ],
  ])('cột %j đọc thành %j', async (row, expected) => {
    expect(await readNoShowCounter(one([row]).em, '77')).toEqual(expected);
  });

  it('readNoShowCounter: câu đọc THƯỜNG (không FOR UPDATE); không có hàng ⇒ null (cả hai hàm đọc)', async () => {
    const em = one([]);
    expect(await readNoShowCounter(em.em, '77')).toBeNull();
    expect(await lockNoShowCounter(em.em, '77')).toBeNull();
    expect(em.queries[0]?.sql).not.toMatch(/FOR\s+UPDATE/i);
    expect(em.labels).toEqual(['read benh_nhan', 'lock benh_nhan']);
  });

  it('incrementNoShow: cộng NGAY trong SQL (so_lan_no_show + 1), không ghi lại giá trị tính ở ứng dụng; đúng 1 hàng ⇒ true, khác ⇒ false', async () => {
    const ok = one([], { affectedRows: 1 });
    expect(await incrementNoShow(ok.em, '77')).toBe(true);
    expect(ok.queries[0]?.sql).toMatch(
      /SET so_lan_no_show = so_lan_no_show \+ 1\s+WHERE tai_khoan_id = \?/,
    );
    expect(ok.queries[0]?.params).toEqual(['77']);
    for (const result of [{ affectedRows: 0 }, {}])
      expect(await incrementNoShow(one([], result).em, '77')).toBe(false);
  });

  it('setNoShowLock: CHỈ bật khi cờ đang tắt (AND khoa_dat_lich_do_no_show = 0); cờ đã bật (0 hàng) ⇒ false', async () => {
    const ok = one([], { affectedRows: 1 });
    expect(await setNoShowLock(ok.em, '77')).toBe(true);
    expect(ok.queries[0]?.sql).toMatch(
      /SET khoa_dat_lich_do_no_show = 1\s+WHERE tai_khoan_id = \? AND khoa_dat_lich_do_no_show = 0/,
    );
    expect(await setNoShowLock(one([], { affectedRows: 0 }).em, '77')).toBe(
      false,
    );
  });
});

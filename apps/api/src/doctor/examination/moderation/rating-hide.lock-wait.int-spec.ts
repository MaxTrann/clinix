import { vi } from 'vitest';
import {
  retryStats,
  sleep,
} from '../../../appointments/testing/concurrency-report.js';
import { settle } from '../../../appointments/testing/override-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import { holdRowLock, withRowLock } from '../testing/exam-concurrency.js';
import {
  hideAuditRows,
  hideBody,
  ratingHideService,
} from '../testing/hide-rating-stack.js';
import { branchScope, SYSTEM_SCOPE } from '../testing/moderation-stack.js';
import { ratingRows } from '../testing/rating-stack.js';

// doctor-exam B8 — CHỜ KHOÁ của ẨN đánh giá trên MySQL 8.4 THẬT (PLAN 5.3, 5.8; KDD-08, KDD-26 `[đề xuất]`; DHK-07 (d); X1b: trần chờ khoá 3 giây × 3 lần của `withBookingTransaction`). Mỗi ca là XÁC ĐỊNH (giữ khoá bằng một kết nối riêng), không vòng lặp.
// CHẬM: ca (a) chờ vài trăm mili giây, (c) ≈ 9 giây, (d) ≈ 4 giây. Tách khỏi rating-hide.concurrency.int-spec.ts để lượt đột biến (M28 chỉ cần ca "ngoài phạm vi") không phải chạy chúng. CHẠY MỘT MÌNH.
// DỰ ĐOÁN (ghi trước khi chạy): (a) `hide` CHỜ rồi thành công, 0 lần thử lại; (b) Admin ngoài phạm vi nhận 404 ngay (< 1,5 giây), 0 lần thử lại (phạm vi kiểm TRƯỚC khi xin khoá); (c) 1205 ở cả ba lần chạy ⇒ 503 sau ≈ 9 giây, hàng và nhật ký nguyên;
// (d) giữ 4 giây ⇒ đúng MỘT lần thử lại 1205 rồi 200.
useStatusWorldHooks();

const TAG = 'B8-DHK';
const NOW = new Date('2026-11-10T09:00:00+07:00');
const RETRY_KEY = 'exam-hide MySQL 1205';
/** Giữ khoá X của hàng đánh giá theo khoá chính: bên "Quản trị viên khác đang ẩn" giả */
const LOCK_RATING_ROW_SQL =
  'SELECT danh_gia_bac_si_id FROM danh_gia_bac_si WHERE danh_gia_bac_si_id = ? FOR UPDATE';

async function lockWorld() {
  vi.setSystemTime(NOW);
  const w = await world();
  const lich = await w.booked('HoanThanh', 0);
  const danhGiaId = await new ExamFixtures(db).rating(lich.lichHenId, {
    soSao: 3,
  });
  return {
    w,
    danhGiaId,
    service: ratingHideService(db),
    system: w.systemAdmin.account.taiKhoanId,
    otherBranchScope: branchScope(String(Number(w.branch.chiNhanhId) + 1000)),
  };
}

const unchanged = async (danhGiaId: string) => {
  const row = (await ratingRows(db)).find((r) => r.danhGiaId === danhGiaId);
  expect(row).toMatchObject({ biAn: 0, lyDoAn: null });
  expect(await hideAuditRows(db)).toEqual([]);
};

describe('DHK-07 (d) KDD-08, KDD-26 chờ khoá của ẨN', () => {
  it('(a) hàng bị giữ khoá 300 ms: `hide` CHỜ (chưa xong sau 150 ms) rồi thành công; 0 lần thử lại; MỘT nhật ký', async () => {
    const t = await lockWorld();
    const held = await holdRowLock(db, LOCK_RATING_ROW_SQL, [t.danhGiaId]);
    let settled = false;
    const start = performance.now();
    const pending = settle(
      t.service.hide(SYSTEM_SCOPE, t.system, t.danhGiaId, hideBody()),
    ).finally(() => {
      settled = true;
    });
    await sleep(150);
    expect(settled).toBe(false);
    await sleep(150);
    await held.release('rollback');
    const result = await pending;
    const ms = performance.now() - start;
    console.info(`[${TAG}] DHK-07 (d) (a): ${ms.toFixed(0)} ms`);
    expect(result.kind).toBe('ok');
    expect(ms).toBeGreaterThan(280);
    expect(ms).toBeLessThan(3000);
    expect(retryStats(logs)).toEqual({ retries: {}, exhausted: 0 });
    expect(await hideAuditRows(db)).toHaveLength(1);
    expect((await ratingRows(db))[0]?.biAn).toBe(1);
  }, 60_000);

  it('(b) KDD-08 hàng ĐANG bị giữ khoá mà Admin Chi nhánh NGOÀI phạm vi gọi ⇒ 404 NGAY (< 1,5 giây; phạm vi kiểm TRƯỚC khi xin khoá), không chờ 9 giây rồi 503; 0 lần thử lại; không ghi', async () => {
    const t = await lockWorld();
    const outcome = await withRowLock(
      db,
      { sql: LOCK_RATING_ROW_SQL, params: [t.danhGiaId] },
      async () => {
        const start = performance.now();
        const result = await settle(
          t.service.hide(t.otherBranchScope, t.system, t.danhGiaId, hideBody()),
        );
        return { result, ms: performance.now() - start };
      },
    );
    console.info(
      `[${TAG}] DHK-07 (d) (b): ${outcome.ms.toFixed(0)} ms, ${JSON.stringify(outcome.result)}`,
    );
    expect(outcome.result).toMatchObject({
      kind: 'refused',
      maLoi: 'KHONG_TIM_THAY',
    });
    expect(outcome.ms).toBeLessThan(1500);
    expect(retryStats(logs)).toEqual({ retries: {}, exhausted: 0 });
    await unchanged(t.danhGiaId);
  }, 60_000);

  it('(c) KDD-26 giữ khoá SUỐT lời gọi ⇒ 1205 ở cả ba lần chạy ⇒ 503 HE_THONG_DANG_BAN sau ≈ 9 giây; hàng và nhật ký nguyên', async () => {
    const t = await lockWorld();
    const outcome = await withRowLock(
      db,
      { sql: LOCK_RATING_ROW_SQL, params: [t.danhGiaId] },
      async () => {
        const start = performance.now();
        const result = await settle(
          t.service.hide(SYSTEM_SCOPE, t.system, t.danhGiaId, hideBody()),
        );
        return { result, ms: performance.now() - start };
      },
    );
    console.info(
      `[${TAG}] DHK-07 (d) (c): ${outcome.ms.toFixed(0)} ms, ${JSON.stringify(outcome.result)}`,
    );
    expect(outcome.result).toMatchObject({
      kind: 'refused',
      maLoi: 'HE_THONG_DANG_BAN',
    });
    expect(outcome.ms).toBeGreaterThan(8500);
    expect(outcome.ms).toBeLessThan(15_000);
    const stats = retryStats(logs);
    expect(stats.retries[RETRY_KEY]).toBe(2);
    expect(stats.exhausted).toBe(1);
    await unchanged(t.danhGiaId);
  }, 60_000);

  it('(d) giữ khoá 4 giây ⇒ lần chạy đầu hết 3 giây (1205), lần chạy thứ hai thành công sau khi nhả: đúng MỘT lần thử lại, rồi 200 và MỘT nhật ký', async () => {
    const t = await lockWorld();
    const held = await holdRowLock(db, LOCK_RATING_ROW_SQL, [t.danhGiaId]);
    const start = performance.now();
    const pending = settle(
      t.service.hide(SYSTEM_SCOPE, t.system, t.danhGiaId, hideBody()),
    );
    await sleep(4000);
    await held.release('rollback');
    const result = await pending;
    const ms = performance.now() - start;
    console.info(`[${TAG}] DHK-07 (d) (d): ${ms.toFixed(0)} ms`);
    expect(result.kind).toBe('ok');
    expect(ms).toBeGreaterThan(3500);
    expect(ms).toBeLessThan(7000);
    expect(retryStats(logs)).toEqual({
      retries: { [RETRY_KEY]: 1 },
      exhausted: 0,
    });
    expect(await hideAuditRows(db)).toHaveLength(1);
  }, 60_000);
});

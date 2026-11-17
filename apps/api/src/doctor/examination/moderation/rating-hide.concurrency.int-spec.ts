import { vi } from 'vitest';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import {
  reportRounds,
  sleep,
  valuesOf,
  winnerTally,
} from '../../../appointments/testing/concurrency-report.js';
import { settle } from '../../../appointments/testing/override-world.js';
import {
  db,
  racePair,
  useStatusWorldHooks,
  world,
  logs,
} from '../../../appointments/testing/status-int-kit.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import {
  createGate,
  EXAM_RACE_ROUNDS,
  runExamRounds,
} from '../testing/exam-concurrency.js';
import {
  auditReasonOf,
  hideAuditRows,
  hideBody,
  ratingHideService,
  readAverage,
  type Average,
} from '../testing/hide-rating-stack.js';
import { branchScope, SYSTEM_SCOPE } from '../testing/moderation-stack.js';
import {
  ratingBody,
  ratingRows,
  ratingService,
  resetRatingRound,
} from '../testing/rating-stack.js';

// doctor-exam B8 — các ca ĐỒNG THỜI của ẨN đánh giá trên MySQL 8.4 THẬT (PLAN 5.3, 7.8 DHK-07, DHK-08; X1 M3). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình int; không chạy cùng lúc với ca nặng khác).
// Ca CHỜ KHOÁ chậm (giữ khoá, 503 sau ≈ 9 giây) ở rating-hide.lock-wait.int-spec.ts: tách riêng để lượt đột biến không phải chạy chúng. Mỗi vòng: dữ liệu SẠCH, các bên cùng xuất phát, IVK-01…IVK-05 sau vòng (`runExamRounds`),
// rồi IN một dòng `[B8-DHK]` (số vòng, bên thắng, số lần thử lại 1213/1205 theo nhãn, số yêu cầu hết lượt 503).
// TIÊU CHÍ ĐẶT TRƯỚC KHI ĐO (TRACKING 25.3): DHK-07 (a): mỗi vòng đúng MỘT 200 và MỘT 409 `DANH_GIA_DA_AN`; `ly_do_an` là lý do của BÊN THẮNG; đúng MỘT dòng `AnDanhGia` của bên thắng; 0 × 503; 0 lần thử lại. (b) ba bên: một 200, hai 409,
// một nhật ký. (c) ẩn ‖ gửi đánh giá MỚI của cùng bác sĩ (lịch khác): cả hai thành công, 0 lần thử lại. DHK-08: mọi lần đọc ∈ {bản cũ, bản mới}; lần đọc BẮT ĐẦU sau khi `hide` đã trả phải là bản mới; ca (a) đóng băng người ghi: đọc thấy bản cũ, không bị chặn.
// DỰ ĐOÁN (ghi trước khi chạy; lệch thì GHI, không sửa): 0 lần thử lại, 0 × 503 ở mọi ca (các bên chỉ tranh MỘT khoá hàng đánh giá; bên chờ không giữ khoá nào nên không có chu trình); DHK-08 (a) người ghi chỉ giữ khoá trên `danh_gia_bac_si`.
useStatusWorldHooks();

const TAG = 'B8-DHK';
const SLOW = 600_000;
const NOW = new Date('2026-11-10T09:00:00+07:00');
const ALREADY_HIDDEN = 'DANH_GIA_DA_AN';
const REASON_A = 'Lý do của Quản trị viên thứ nhất';
const REASON_B = 'Lý do của Quản trị viên thứ hai';
const BEFORE: Average = { diem: '3.3', soDanhGia: 3 };
const AFTER: Average = { diem: '4.5', soDanhGia: 2 };

async function raceWorld() {
  vi.setSystemTime(NOW);
  const w = await world();
  return {
    w,
    exam: new ExamFixtures(db),
    service: ratingHideService(db),
    system: w.systemAdmin.account.taiKhoanId,
    branchAdmin: w.branchAdmin.account.taiKhoanId,
    branch: branchScope(w.branch.chiNhanhId),
    doctorId: w.doctor.account.taiKhoanId,
  };
}
type RaceWorld = Awaited<ReturnType<typeof raceWorld>>;

/** Lịch `HoanThanh` ở khung giờ số `slot` kèm MỘT đánh giá `soSao` (SQL thẳng); trả id đánh giá. */
async function rated(t: RaceWorld, slot: number, soSao: number) {
  const lich = await t.w.booked('HoanThanh', slot);
  return {
    lich,
    danhGiaId: await t.exam.rating(lich.lichHenId, { soSao }),
  };
}

describe('DHK-07 (KDD-09) hai Quản trị viên ẩn cùng một đánh giá: một 200, một 409 DANH_GIA_DA_AN; MỘT nhật ký; lý do của bên thắng', () => {
  it(
    `(a) hai Admin (Toàn hệ thống và Chi nhánh đúng chi nhánh), ${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRatingRound(db);
          return rated(t, 0, 3);
        },
        race: ({ danhGiaId }, round) =>
          racePair(
            round,
            () =>
              settle(
                t.service.hide(
                  SYSTEM_SCOPE,
                  t.system,
                  danhGiaId,
                  hideBody({ lyDo: REASON_A }),
                ),
              ),
            () =>
              settle(
                t.service.hide(
                  t.branch,
                  t.branchAdmin,
                  danhGiaId,
                  hideBody({ lyDo: REASON_B }),
                ),
              ),
          ),
        check: async ({ danhGiaId }, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o, index) =>
            o.kind === 'ok' ? [{ index, value: o.value }] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(wins[0]?.value).toEqual({ danhGiaId, biAn: true });
          expect(refused).toEqual([ALREADY_HIDDEN]);
          // `results` theo đúng thứ tự `racePair` (Toàn hệ thống rồi Chi nhánh)
          const winnerFirst = wins[0]?.index === 0;
          const expectedReason = winnerFirst ? REASON_A : REASON_B;
          const rows = await ratingRows(db);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({ biAn: 1, lyDoAn: expectedReason });
          const audit = await hideAuditRows(db);
          expect(audit).toHaveLength(1);
          expect(audit[0]?.taiKhoanId).toBe(
            winnerFirst ? t.system : t.branchAdmin,
          );
          expect(auditReasonOf(audit[0])).toBe(expectedReason);
          tally.add(winnerFirst ? 'toanHeThong' : 'chiNhanh');
        },
      });
      reportRounds(TAG, 'DHK-07 (a)', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );

  it(
    `(b) [đề xuất] ba Admin cùng lúc, ${String(EXAM_RACE_ROUNDS)} vòng: một 200, hai 409; một dòng nhật ký`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      const actors = [
        { scope: SYSTEM_SCOPE, id: t.system, reason: 'Lý do của bên số một' },
        { scope: t.branch, id: t.branchAdmin, reason: 'Lý do của bên số hai' },
        { scope: SYSTEM_SCOPE, id: t.system, reason: 'Lý do của bên số ba' },
      ];
      await runExamRounds(db, {
        setup: async () => {
          await resetRatingRound(db);
          return rated(t, 0, 3);
        },
        race: ({ danhGiaId }) => {
          const gate = createGate(actors.length);
          return actors.map((actor) => async () => {
            await gate.arrive();
            return settle(
              t.service.hide(
                actor.scope,
                actor.id,
                danhGiaId,
                hideBody({ lyDo: actor.reason }),
              ),
            );
          });
        },
        check: async (_context, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o, index) =>
            o.kind === 'ok' ? [index] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(refused).toEqual([ALREADY_HIDDEN, ALREADY_HIDDEN]);
          const rows = await ratingRows(db);
          expect(rows[0]).toMatchObject({
            biAn: 1,
            lyDoAn: actors[wins[0] ?? 0]?.reason,
          });
          expect(await hideAuditRows(db)).toHaveLength(1);
          tally.add(`bên ${String((wins[0] ?? 0) + 1)}`);
        },
      });
      reportRounds(TAG, 'DHK-07 (b)', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );

  it(
    '(c) [đề xuất] ẩn một đánh giá ‖ Bệnh nhân gửi đánh giá MỚI của cùng bác sĩ (lịch khác), 20 vòng: cả hai thành công, 0 lần thử lại; đánh giá mới vẫn hiển thị; điểm của bác sĩ chỉ còn đánh giá mới',
    async () => {
      const t = await raceWorld();
      const patients = ratingService(db);
      const tally = winnerTally();
      await runExamRounds(db, {
        rounds: 20,
        setup: async () => {
          await resetRatingRound(db);
          const target = await rated(t, 0, 3);
          const next = await t.w.booked('HoanThanh', 1);
          return { ...target, next };
        },
        race: ({ danhGiaId, next }, round) =>
          racePair(
            round,
            () =>
              settle(
                t.service.hide(SYSTEM_SCOPE, t.system, danhGiaId, hideBody()),
              ),
            () =>
              settle(
                patients.submit(
                  t.w.patientId,
                  next.maLichHen,
                  ratingBody({ soSao: 5, nhanXet: 'Đánh giá mới' }),
                ),
              ),
          ),
        check: async ({ danhGiaId, next }, results) => {
          const outcomes = valuesOf(results);
          expect(outcomes.map((o) => o.kind)).toEqual(['ok', 'ok']);
          const rows = await ratingRows(db);
          expect(rows.find((r) => r.danhGiaId === danhGiaId)?.biAn).toBe(1);
          expect(
            rows.find((r) => r.lichHenId === next.lichHenId),
          ).toMatchObject({
            soSao: 5,
            biAn: 0,
          });
          expect(await readAverage(db, t.doctorId)).toEqual({
            diem: '5.0',
            soDanhGia: 1,
          });
          expect(await hideAuditRows(db)).toHaveLength(1);
          tally.add('cả hai thành công');
        },
      });
      reportRounds(TAG, 'DHK-07 (c)', 20, tally.winners, logs);
    },
    SLOW,
  );
});

/** Một lần đọc của DHK-08 (b): ghi lại việc nó BẮT ĐẦU trước hay sau khi `hide` đã trả. */
interface ReadLog {
  afterCommit: boolean;
  average: Average | null;
}

/** Kết quả của một bên trong vòng DHK-08 (b): bên ghi có `writerOk`, bên đọc có `reads`. */
interface Part {
  writerOk: boolean | null;
  reads: ReadLog[];
}

describe('DHK-08 ẩn ‖ đọc điểm trung bình (bản chép câu PLAN 5.9): mỗi lần đọc thấy trước hoặc sau; sau commit mọi lần đọc thấy sau', () => {
  /** Bác sĩ có ba đánh giá 5, 4, 1 (điểm "3.3", 3 lượt); trả id đánh giá 1 sao (sẽ ẩn). */
  async function threeRatings(t: RaceWorld) {
    await rated(t, 0, 5);
    await rated(t, 1, 4);
    return (await rated(t, 2, 1)).danhGiaId;
  }

  it('(a) xác định, đóng băng người ghi: sau UPDATE mà CHƯA commit, đọc thấy BẢN CŨ và KHÔNG bị chặn; người ghi chỉ giữ khoá trên danh_gia_bac_si; sau commit đọc thấy BẢN MỚI', async () => {
    const t = await raceWorld();
    const target = await threeRatings(t);
    expect(await readAverage(db, t.doctorId)).toEqual(BEFORE);
    const real = new AuditService(new AuditRepository());
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const arrived = new Promise<void>((resolve) => (reached = resolve));
    const frozen = ratingHideService(db, {
      record: async (em, entry) => {
        reached();
        await gate;
        await real.record(em, entry);
      },
    });
    const pending = settle(
      frozen.hide(SYSTEM_SCOPE, t.system, target, hideBody()),
    );
    await Promise.race([
      arrived,
      sleep(10_000).then(() => {
        throw new Error('người ghi không tới được điểm đóng băng');
      }),
    ]);
    // người ghi đã khoá và UPDATE xong, CHƯA commit
    const start = performance.now();
    const during = await readAverage(db, t.doctorId);
    const ms = performance.now() - start;
    expect(during).toEqual(BEFORE);
    expect(ms).toBeLessThan(2000);
    expect(
      (await ratingRows(db)).find((r) => r.danhGiaId === target)?.biAn,
    ).toBe(0);
    const held = await db.query<{ tableName: string }[]>(
      'SELECT DISTINCT OBJECT_NAME AS tableName FROM performance_schema.data_locks WHERE OBJECT_SCHEMA = DATABASE() ORDER BY 1',
    );
    console.info(
      `[${TAG}] DHK-08 (a): đọc lúc đóng băng ${ms.toFixed(0)} ms, bản ${JSON.stringify(during)}; bảng bị khoá: ${JSON.stringify(held.map((row) => row.tableName))}`,
    );
    // giả định của TRACKING 25 điều 2: khoá chỉ nằm trên danh_gia_bac_si (KHÔNG lich_hen). Bảng rỗng ⇒ không đo được (ghi nhận, không bật cấu hình nào)
    if (held.length > 0)
      expect(held.map((row) => row.tableName)).toEqual(['danh_gia_bac_si']);
    release();
    expect((await pending).kind).toBe('ok');
    expect(await readAverage(db, t.doctorId)).toEqual(AFTER);
    expect(await hideAuditRows(db)).toHaveLength(1);
  }, 60_000);

  it(
    `(b) ba vòng đọc liên tục ‖ hide, ${String(EXAM_RACE_ROUNDS)} vòng: mọi lần đọc ∈ {bản cũ, bản mới}; lần đọc bắt đầu SAU commit là bản mới`,
    async () => {
      const t = await raceWorld();
      const seenTotal = { truocCommit: 0, sauCommit: 0, banCu: 0, banMoi: 0 };
      await runExamRounds(db, {
        setup: async () => {
          await resetRatingRound(db);
          return { target: await threeRatings(t) };
        },
        race: ({ target }) => {
          const state = { committed: false, stop: false };
          const writer = async (): Promise<Part> => {
            try {
              await sleep(3);
              const result = await settle(
                t.service.hide(SYSTEM_SCOPE, t.system, target, hideBody()),
              );
              state.committed = true;
              await sleep(15);
              return { writerOk: result.kind === 'ok', reads: [] };
            } finally {
              state.stop = true;
            }
          };
          const reader = async (): Promise<Part> => {
            const reads: ReadLog[] = [];
            while (!state.stop) {
              // cờ chụp TRƯỚC khi gửi câu đọc: "bắt đầu sau commit"
              const afterCommit = state.committed;
              reads.push({
                afterCommit,
                average: await readAverage(db, t.doctorId),
              });
            }
            return { writerOk: null, reads };
          };
          return [writer, reader, reader, reader];
        },
        check: (_context, results) => {
          const parts = valuesOf(results);
          expect(parts[0]?.writerOk).toBe(true);
          for (const read of parts.flatMap((part) => part.reads)) {
            expect([BEFORE, AFTER], JSON.stringify(read)).toContainEqual(
              read.average,
            );
            if (read.afterCommit) expect(read.average).toEqual(AFTER);
            seenTotal[read.afterCommit ? 'sauCommit' : 'truocCommit'] += 1;
            seenTotal[read.average?.soDanhGia === 3 ? 'banCu' : 'banMoi'] += 1;
          }
        },
      });
      console.info(
        `[${TAG}] DHK-08 (b): ${String(EXAM_RACE_ROUNDS)} vòng; số lần đọc ${JSON.stringify(seenTotal)}`,
      );
      reportRounds(
        TAG,
        'DHK-08 (b)',
        EXAM_RACE_ROUNDS,
        { 'ghi ‖ đọc': EXAM_RACE_ROUNDS },
        logs,
      );
    },
    SLOW,
  );
});

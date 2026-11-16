import { vi } from 'vitest';
import { withRowLock } from '../../../appointments/testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  valuesOf,
  winnerTally,
} from '../../../appointments/testing/concurrency-report.js';
import { assertBookingInvariants } from '../../../appointments/testing/invariants.js';
import { raceRounds } from '../../../appointments/testing/override-race.js';
import {
  createOverrideStack,
  overrideBy,
  resetOverrideRound,
  settle,
} from '../../../appointments/testing/override-world.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import {
  EXAM_RACE_ROUNDS,
  runExamRounds,
} from '../testing/exam-concurrency.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import { assertExamInvariants } from '../testing/exam-invariants.js';
import {
  editAuditRows,
  recordBody,
  recordRows,
  recordService,
} from '../testing/exam-record-stack.js';
import { accountName, detailService } from '../testing/patient-exam-stack.js';
import type { PatientExamDetail } from '../patient-view/patient-exam-detail.dto.js';

// doctor-exam B2 — các ca ĐỒNG THỜI của ghi và sửa hồ sơ khám trên MySQL 8.4 THẬT (PLAN 5.3, 7.8 DHK-03, DHK-04, DHK-05, DHK-10, DHK-11; X1 M2, M3). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình int;
// không chạy cùng lúc với ca nặng khác). DHK-02 (`complete` ‖ `PUT`) ở completion/exam-completion.concurrency.int-spec.ts (thay DHK-12 mô phỏng của B1). Mỗi vòng: dữ liệu SẠCH, hai bên cùng xuất phát (`racePair`, xen kẽ ai đi trước),
// IVK-01…IVK-05 và INV-01…INV-05 sau vòng, rồi IN một dòng `[B2-DHK]` (số vòng, bên thắng, số lần thử lại 1213/1205 theo nhãn, số yêu cầu hết lượt 503).
// DỰ ĐOÁN (ghi trước khi chạy, TRACKING 13.2; lệch thì GHI, không sửa dự đoán): P1 DHK-03, DHK-04, DHK-05: 0 lần thử lại, 0 × 503 (khoá `lich_hen` X trước mọi ghi; X1 M1 đến M3 và DHK-12 của B1 đều 0); P2 DHK-11: 0 lần thử lại, 0 × 503, đánh giá luôn
// vào được sau một lần chờ ngắn (X1 M3: vài ms); P3 DHK-10: 0 lần thử lại (PUT không xin `benh_nhan` nên không có chu trình như DHK-09 của B1; bật `retriesAllowed` đề phòng), 503 = 0 chắc chắn; P4 mọi ca: INV, IVK xanh sau mỗi vòng;
// DHK-03 và DHK-04(a): đúng một 200 và một 409 `HO_SO_KHAM_DA_THAY_DOI` mỗi vòng, không 1062 lộ. DHK-05 dùng bên đọc THẬT (`PatientExamDetailService`, B5: thay bên đọc mô phỏng của B2; kèm ca xác định (b) bằng khoá hàng); DHK-11 còn dùng bên đánh giá MÔ PHỎNG (B6 chưa có): B6 thay bằng service thật.
useStatusWorldHooks();

const TAG = 'B2-DHK';
const SLOW = 600_000;
const NOW = new Date('2026-11-10T09:00:00+07:00');
const SEEDED_AT = '2026-11-10 08:00:00';
const SEEDED_TOKEN = '2026-11-10T01:00:00.000Z';
/** `capNhatLanCuoi` sau khi bác sĩ sửa lúc 09:00 giờ VN (đồng hồ giả NOW) */
const EDITED_ISO = '2026-11-10T02:00:00.000Z';
const CONFLICT = 'HO_SO_KHAM_DA_THAY_DOI';
const NOT_WRITABLE = 'KHONG_THE_GHI_HO_SO_KHAM';

/** Dọn giữa các vòng: đánh giá và hồ sơ khám (khoá ngoại tới lịch) trước, rồi như `resetBookingRound` + nhật ký (qua `resetOverrideRound`). */
async function resetRound(): Promise<void> {
  await db.query('DELETE FROM danh_gia_bac_si');
  await db.query('DELETE FROM ho_so_kham');
  await resetOverrideRound(db);
}

async function raceWorld() {
  vi.setSystemTime(NOW);
  const w = await world();
  return {
    w,
    service: recordService(db),
    doctorId: w.doctor.account.taiKhoanId,
    exam: new ExamFixtures(db),
  };
}

describe('DHK-03 hai PUT cùng token (hai tab) trên hồ sơ đã có: một thắng, một HO_SO_KHAM_DA_THAY_DOI; một dòng; một nhật ký', () => {
  it(
    `${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          const lich = await t.w.booked('HoanThanh', 0);
          await t.exam.record(lich.lichHenId, { capNhatLanCuoi: SEEDED_AT });
          return lich;
        },
        race: (lich, round) =>
          racePair(
            round,
            () =>
              settle(
                t.service.save(
                  t.doctorId,
                  lich.maLichHen,
                  recordBody({
                    huongXuLy: 'Tab 1',
                    capNhatLanCuoi: SEEDED_TOKEN,
                  }),
                ),
              ),
            () =>
              settle(
                t.service.save(
                  t.doctorId,
                  lich.maLichHen,
                  recordBody({
                    huongXuLy: 'Tab 2',
                    capNhatLanCuoi: SEEDED_TOKEN,
                  }),
                ),
              ),
          ),
        check: async (lich, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o) =>
            o.kind === 'ok' ? [o.value] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(refused).toEqual([CONFLICT]);
          const winner = wins[0]?.huongXuLy;
          const rows = await recordRows(db, lich.lichHenId);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.huongXuLy).toBe(winner);
          const audit = await editAuditRows(db);
          expect(audit).toHaveLength(1);
          expect(audit[0]?.chiTiet).toMatchObject({
            sau: { huong_xu_ly: winner },
          });
          tally.add(winner === 'Tab 1' ? 'tab1' : 'tab2');
        },
      });
      reportRounds(TAG, 'DHK-03', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );
});

describe('DHK-04 hai PUT LẦN ĐẦU (token null): (a) cùng lịch: một INSERT, một 409, không 1062 lộ; (b) hai lịch KHÁC nhau: cả hai 200, không chờ nhau (chạy lại X1 M2 bằng service thật)', () => {
  it(
    `(a) cùng một lịch DaTiepDon, ${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          return t.w.booked('DaTiepDon', 0);
        },
        race: (lich, round) =>
          racePair(
            round,
            () =>
              settle(
                t.service.save(
                  t.doctorId,
                  lich.maLichHen,
                  recordBody({ huongXuLy: 'Tab 1' }),
                ),
              ),
            () =>
              settle(
                t.service.save(
                  t.doctorId,
                  lich.maLichHen,
                  recordBody({ huongXuLy: 'Tab 2' }),
                ),
              ),
          ),
        check: async (lich, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o) =>
            o.kind === 'ok' ? [o.value] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(refused).toEqual([CONFLICT]);
          const rows = await recordRows(db, lich.lichHenId);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.huongXuLy).toBe(wins[0]?.huongXuLy);
          expect(await editAuditRows(db)).toEqual([]);
          tally.add(wins[0]?.huongXuLy === 'Tab 1' ? 'tab1' : 'tab2');
        },
      });
      reportRounds(TAG, 'DHK-04 (a)', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );

  it(
    `(b) hai lịch khác nhau cùng lúc, ${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          return [
            await t.w.booked('DaTiepDon', 0),
            await t.w.booked('DaTiepDon', 1),
          ] as const;
        },
        race: ([first, second], round) =>
          racePair(
            round,
            () => t.service.save(t.doctorId, first.maLichHen, recordBody()),
            () => t.service.save(t.doctorId, second.maLichHen, recordBody()),
          ),
        check: async ([first, second], results) => {
          expect(valuesOf(results)).toHaveLength(2);
          expect(await recordRows(db, first.lichHenId)).toHaveLength(1);
          expect(await recordRows(db, second.lichHenId)).toHaveLength(1);
          tally.add('ca-hai-200');
        },
      });
      reportRounds(TAG, 'DHK-04 (b)', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );
});

/**
 * Độ trễ (ms) của bên đọc ở DHK-05, xoay vòng theo vòng. Lần chạy ĐẦU của bên đọc MÔ PHỎNG (B2; không có độ trễ) thấy bản CŨ ở 40/40 vòng: một câu `SELECT` xong trước khi PUT kịp commit, nên nhánh "đọc bản mới" chưa bao giờ chạy
 * và ca chưa chứng minh được gì về bản mới. Thêm quét độ trễ để cả hai nhánh cùng xảy ra (số của hai lần chạy đều được ghi ở TRACKING 13.8; số của bên đọc THẬT ở TRACKING 18.8).
 */
const READER_DELAYS_MS = [0, 2, 4, 6, 8, 10, 14, 20];

describe('DHK-05 [đề xuất, B2; bên đọc THẬT từ B5] PatientExamDetailService THẬT ‖ Bác sĩ sửa: đọc thấy TRỌN bản cũ hoặc TRỌN bản mới, không lẫn trường, không bị chặn', () => {
  it(
    `${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const reader = detailService(db);
      const doctorName = await accountName(db, t.doctorId);
      const tally = winnerTally();
      const old = {
        trieuChung: 'V1 triệu chứng',
        chanDoanSoBo: 'V1 chẩn đoán',
        huongXuLy: 'V1 hướng xử lý',
      };
      const fresh = {
        trieuChung: 'V2 triệu chứng',
        chanDoanSoBo: 'V2 chẩn đoán',
        huongXuLy: 'V2 hướng xử lý',
        ngayTaiKhamDuKien: '2026-12-01',
      };
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          const lich = await t.w.booked('HoanThanh', 0);
          await t.exam.record(lich.lichHenId, {
            ...old,
            capNhatLanCuoi: SEEDED_AT,
          });
          return lich;
        },
        race: (lich, round) =>
          racePair(
            round,
            () =>
              t.service.save(
                t.doctorId,
                lich.maLichHen,
                recordBody({ ...fresh, capNhatLanCuoi: SEEDED_TOKEN }),
              ),
            async () => {
              await sleep(
                READER_DELAYS_MS[round % READER_DELAYS_MS.length] ?? 0,
              );
              return reader.detail(t.w.patientId, lich.maLichHen);
            },
          ),
        check: async (_lich, results) => {
          const [, read] = valuesOf(results) as [unknown, PatientExamDetail];
          const record = read.hoSoKham;
          const isOld = record?.capNhatLanCuoi === SEEDED_TOKEN;
          // toEqual: ĐÚNG sáu khoá, không lẫn trường của hai bản
          expect(record, 'không được lẫn trường của hai bản').toEqual(
            isOld
              ? {
                  ...old,
                  ngayTaiKhamDuKien: null,
                  capNhatLanCuoi: SEEDED_TOKEN,
                  capNhatBoi: doctorName,
                }
              : {
                  ...fresh,
                  capNhatLanCuoi: EDITED_ISO,
                  capNhatBoi: doctorName,
                },
          );
          tally.add(isOld ? 'doc-ban-cu' : 'doc-ban-moi');
        },
      });
      reportRounds(TAG, 'DHK-05', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );
});

describe('DHK-05 (b) [đề xuất, B5] bên đọc THẬT không bị chặn bởi khoá hàng và không thấy ghi chưa commit', () => {
  it('xác định (không đua): giữ khoá X trên lich_hen và ho_so_kham của lịch ⇒ detail trả BẢN CŨ ngay; sửa chưa commit vẫn không thấy; sau commit thấy bản mới', async () => {
    const t = await raceWorld();
    const reader = detailService(db);
    const lich = await t.w.booked('HoanThanh', 0);
    await t.exam.record(lich.lichHenId, {
      trieuChung: 'V1 triệu chứng',
      capNhatLanCuoi: SEEDED_AT,
    });
    const read = async (): Promise<PatientExamDetail> => {
      const outcome = await Promise.race([
        reader.detail(t.w.patientId, lich.maLichHen),
        sleep(5000).then(() => 'BI_CHAN' as const),
      ]);
      // bị chặn ⇒ hết 5 giây mà chưa có kết quả (khoá chờ mặc định 50 giây)
      if (outcome === 'BI_CHAN')
        throw new Error('detail bị chặn bởi khoá hàng');
      return outcome;
    };
    await withRowLock(
      db,
      {
        sql: `SELECT lh.lich_hen_id FROM lich_hen lh INNER JOIN ho_so_kham hsk ON hsk.lich_hen_id = lh.lich_hen_id
              WHERE lh.lich_hen_id = ? FOR UPDATE`,
        params: [lich.lichHenId],
      },
      async (held) => {
        expect((await read()).hoSoKham?.trieuChung).toBe('V1 triệu chứng');
        await held.manager.query(
          'UPDATE ho_so_kham SET trieu_chung = ? WHERE lich_hen_id = ?',
          ['CHƯA COMMIT', lich.lichHenId],
        );
        expect((await read()).hoSoKham?.trieuChung).toBe('V1 triệu chứng');
        await held.release('commit');
        expect((await read()).hoSoKham?.trieuChung).toBe('CHƯA COMMIT');
      },
    );
  });
});

describe('DHK-10 PUT hồ sơ THẬT ‖ override Admin THẬT DaTiepDon → DaXacNhan: PUT thắng ⇒ dòng tồn tại; override thắng ⇒ PUT 409 KHONG_THE_GHI_HO_SO_KHAM; lịch luôn DaXacNhan; 503 = 0', () => {
  it(
    '56 vòng (40 xen kẽ + 16 quét độ lệch, như DHK-09 của B1)',
    async () => {
      const t = await raceWorld();
      await raceRounds({
        tag: TAG,
        name: 'DHK-10',
        logs,
        setup: async () => {
          await resetRound();
          const lich = await t.w.booked('DaTiepDon', 0);
          return { lich, stack: createOverrideStack(db) };
        },
        first: ({ lich }) =>
          settle(t.service.save(t.doctorId, lich.maLichHen, recordBody())),
        second: ({ lich, stack }) =>
          settle(overrideBy(t.w, stack, 'Toan', lich.maLichHen, 'DaXacNhan')),
        check: async ({ lich }, put, override, tally) => {
          for (const side of [put, override])
            if (side.kind === 'refused')
              expect(side.maLoi, 'không được hết lượt (503)').not.toBe(
                'HE_THONG_DANG_BAN',
              );
          expect(
            override.kind,
            'override DaTiepDon → DaXacNhan luôn được',
          ).toBe('ok');
          expect((await t.w.snapshot(lich, 0)).row.trangThai).toBe('DaXacNhan');
          const rows = await recordRows(db, lich.lichHenId);
          if (put.kind === 'ok') {
            // PUT thắng: dòng tồn tại (override đến sau, giữ dòng, Q16)
            expect(rows).toHaveLength(1);
            tally.add('put');
          } else {
            // override thắng: PUT bị từ chối vì lịch DaXacNhan, không có dòng
            expect(put).toMatchObject({
              kind: 'refused',
              maLoi: NOT_WRITABLE,
              chiTiet: { trangThai: 'DaXacNhan' },
            });
            expect(rows).toEqual([]);
            tally.add('override');
          }
          await assertBookingInvariants(db);
          await assertExamInvariants(db);
        },
        options: { retriesAllowed: true },
      });
    },
    SLOW,
  );
});

describe('DHK-11 [đề xuất, B2] gửi đánh giá MÔ PHỎNG ‖ PUT hồ sơ cùng lịch HoanThanh: không deadlock; đánh giá chờ ngắn rồi thành công (X1 M3)', () => {
  it(
    `${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      const waits: number[] = [];
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          const lich = await t.w.booked('HoanThanh', 0);
          await t.exam.record(lich.lichHenId, { capNhatLanCuoi: SEEDED_AT });
          return lich;
        },
        race: (lich, round) =>
          racePair(
            round,
            () =>
              t.service.save(
                t.doctorId,
                lich.maLichHen,
                recordBody({
                  huongXuLy: 'Sửa lúc có đánh giá',
                  capNhatLanCuoi: SEEDED_TOKEN,
                }),
              ),
            // Bên đánh giá là `INSERT danh_gia_bac_si` thô (B6 chưa có): xin S ngầm trên hàng cha `lich_hen` nên chờ đúng phần còn lại của PUT
            async () => {
              const start = performance.now();
              await t.exam.rating(lich.lichHenId);
              return performance.now() - start;
            },
          ),
        check: async (lich, results) => {
          const [put, wait] = valuesOf(results) as [
            { huongXuLy: string },
            number,
          ];
          expect(put.huongXuLy).toBe('Sửa lúc có đánh giá');
          expect(await editAuditRows(db)).toHaveLength(1);
          const ratings = await db.query<{ n: string | number }[]>(
            'SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE lich_hen_id = ?',
            [lich.lichHenId],
          );
          expect(Number(ratings[0]?.n)).toBe(1);
          waits.push(wait);
          tally.add('ca-hai-xong');
        },
      });
      const sorted = [...waits].sort((a, b) => a - b);
      console.info(
        `[${TAG}] DHK-11 chờ của INSERT đánh giá (ms): trung vị ${String(sorted[Math.floor(sorted.length / 2)]?.toFixed(1))}, nhỏ nhất ${String(sorted[0]?.toFixed(1))}, lớn nhất ${String(sorted.at(-1)?.toFixed(1))} (${String(sorted.length)} vòng)`,
      );
      reportRounds(TAG, 'DHK-11', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );
});

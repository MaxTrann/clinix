import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { ReportOptions } from '../testing/concurrency-report.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { createNoShowOverrideStack } from '../testing/no-show-override-world.js';
import { raceRounds } from '../testing/override-race.js';
import {
  expectedAudit,
  overrideBy,
  readAudit,
  resetOverrideRound,
  settle,
} from '../testing/override-world.js';
import { notificationRows } from '../testing/payment-doctor-fakes.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import {
  AFTER_ALL_WINDOWS,
  readNoShow,
  setNoShow,
  type StatusWorld,
} from '../testing/status-world.js';
import { emptyNoShowSummary } from './no-show-sweep.service.js';

// Task B18 — hai ca ĐỒNG THỜI của Quản trị viên override và job tự Vắng mặt trên MySQL 8.4 THẬT (PLAN booking 7.46 `[đề xuất]` NSO-09, NSO-10; TRACKING 3.40 B18-E, B18-F). CHẠY MỘT MÌNH. Khung vòng `testing/override-race.ts` của B14
// (40 vòng xen kẽ thứ tự xuất phát cộng bản quét độ lệch 0, 1, 2, 3, 5, 8, 12, 20 ms mỗi bên, tổng 56 vòng): mỗi ca ĐẾM lần thử lại 1213 và 1205, GHI bên thắng mỗi vòng (dòng `[B18-DT]`), INV-01…INV-05 sau mỗi vòng, khẳng định 503 = 0.
// DỰ ĐOÁN (ghi 14/11/2026 TRƯỚC khi viết và chạy ca này, TRACKING 3.40 B18-E; lệch thì GHI, không sửa dự đoán):
//  P1 không có cạnh khoá mới: mảnh "chưa từng override" là đọc thường (READ COMMITTED), không xin khoá nào.
//  P2 NSO-09 (Admin khôi phục VangMat → DaXacNhan đua job; lịch đối chứng của Bệnh nhân KHÁC): so_lan_no_show của chủ lịch được khôi phục KHÔNG tăng ở vòng nào; lịch luôn DaXacNhan với đúng MỘT dòng nhật ký; lịch đối chứng luôn bị đánh;
//     0 lần thử lại; 503 = 0. Hai thứ tự cho CÙNG kết quả nên ca này chứng minh "không cộng đôi", KHÔNG phải ca tranh khoá (không có "bên thắng" để đếm).
//  P3 NSO-10 (Admin lùi DaTiepDon rồi khôi phục DaXacNhan, hai lời gọi, đua job trên lịch DaXacNhan quá hạn chưa từng override): mọi vòng kết thúc ở DaXacNhan với đúng hai dòng nhật ký (KHÔNG BAO GIỜ VangMat ở cuối); so_lan_no_show
//     thuộc {0, 1} và bằng 1 khi và chỉ khi job đánh TRƯỚC lệnh đầu của Admin; 503 = 0; số lần thử lại 1213 từ 0 đến vài lần (cạnh B12-Q: job giữ `benh_nhan` X chờ `lich_hen` X, Admin giữ `lich_hen` X chờ S trên `benh_nhan`;
//     nạn nhân là job như B13-P), cùng bậc DT-06 của B13 (6 đến 17 lần trên 65 vòng), không quá một lần mỗi vòng; cả hai bên thắng ít nhất vài vòng (dự đoán YẾU: B13-N đã gặp chia 20/20 theo thứ tự xuất phát).
const TAG = 'B18-DT';
const SLOW = 300_000;
const ZERO = emptyNoShowSummary();
const { NO_SHOW } = BOOKING_NOTIFICATION_EVENTS;
/** Cạnh chu trình đã đo (B12-Q): vẫn IN số lần thử lại nhưng không ép 0; 503 vẫn ép 0 */
const HIDDEN_FK_LOCK: ReportOptions = { retriesAllowed: true };

useStatusWorldHooks();

type Lich = Awaited<ReturnType<StatusWorld['booked']>>;
interface Round {
  w: StatusWorld;
  lich: Lich;
  /** Lịch đối chứng của Bệnh nhân KHÁC (chỉ NSO-09) */
  control?: Lich;
  stack: ReturnType<typeof createNoShowOverrideStack>;
}

/** Dữ liệu SẠCH của một vòng: lịch `from` ở khung giờ số 0 của Bệnh nhân thứ nhất (đã có `soLan` lần Vắng mặt); `withControl` thêm lịch `DaXacNhan` ở khung giờ số 1 của Bệnh nhân thứ hai. MỘT bộ dịch vụ cho cả hai bên. */
const freshRound =
  (
    w: StatusWorld,
    from: 'DaXacNhan' | 'VangMat',
    soLan: number,
    withControl: boolean,
  ) =>
  async (): Promise<Round> => {
    await resetOverrideRound(db);
    await setNoShow(db, w.patientId, { soLan, khoa: false });
    await setNoShow(db, w.secondPatientId, { soLan: 0, khoa: false });
    const lich = await w.booked(from, 0);
    const control = withControl
      ? await w.booked('DaXacNhan', 1, { patientId: w.secondPatientId })
      : undefined;
    return {
      w,
      lich,
      ...(control ? { control } : {}),
      stack: createNoShowOverrideStack(db),
    };
  };

const eventsOf = async () =>
  (await notificationRows(db)).map((row) => row.loai).sort();

describe('NSO-09 (P2) Quản trị viên khôi phục VangMat → DaXacNhan đua job: so_lan_no_show của lịch được khôi phục KHÔNG tăng; lịch đối chứng vẫn bị đánh; 0 lần thử lại', () => {
  it(
    'mọi vòng: lịch DaXacNhan với đúng một dòng nhật ký, so_lan_no_show của chủ lịch giữ nguyên, lịch đối chứng VangMat (+1 của Bệnh nhân khác), một thông báo',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'NSO-09',
        logs,
        setup: freshRound(w, 'VangMat', 1, true),
        first: ({ w: world_, lich, stack }: Round) =>
          settle(
            overrideBy(world_, stack, 'Toan', lich.maLichHen, 'DaXacNhan'),
          ),
        second: ({ stack }: Round) => stack.job.run(AFTER_ALL_WINDOWS),
        check: async (
          { w: world_, lich, control },
          override,
          summary,
          tally,
        ) => {
          if (control === undefined) throw new Error('thiếu lịch đối chứng');
          expect(override).toMatchObject({ kind: 'ok' });
          expect(summary).toEqual({ ...ZERO, noShowed: 1 });
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaXacNhan',
          );
          expect((await readAppointment(db, control.lichHenId)).trangThai).toBe(
            'VangMat',
          );
          expect(await readNoShow(db, world_.patientId)).toEqual({
            soLan: 1,
            khoa: false,
          });
          expect(await readNoShow(db, world_.secondPatientId)).toEqual({
            soLan: 1,
            khoa: false,
          });
          expect(await readAudit(db)).toMatchObject([
            expectedAudit(
              world_,
              'Toan',
              lich.lichHenId,
              'VangMat',
              'DaXacNhan',
            ),
          ]);
          expect(await eventsOf()).toEqual([NO_SHOW]);
          await assertBookingInvariants(db);
          tally.add('khôi phục xong, job không đánh lại');
        },
      });
    },
    SLOW,
  );
});

describe('NSO-10 (P3) Quản trị viên lùi DaTiepDon rồi khôi phục DaXacNhan (hai lời gọi) đua job trên lịch chưa từng override: không bao giờ kết thúc ở VangMat; so_lan_no_show 0 hoặc 1 đúng bên thắng', () => {
  it(
    'mọi vòng: lịch cuối DaXacNhan với đúng hai dòng nhật ký; job thắng ⇔ so_lan_no_show 1; số lần thử lại 1213 được ghi (cạnh B12-Q cho phép), 503 = 0',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'NSO-10',
        logs,
        options: HIDDEN_FK_LOCK,
        setup: freshRound(w, 'DaXacNhan', 0, false),
        first: async ({ w: world_, lich, stack }: Round) => ({
          step1: await settle(
            overrideBy(world_, stack, 'Toan', lich.maLichHen, 'DaTiepDon'),
          ),
          step2: await settle(
            overrideBy(world_, stack, 'Toan', lich.maLichHen, 'DaXacNhan'),
          ),
        }),
        second: ({ stack }: Round) => stack.job.run(AFTER_ALL_WINDOWS),
        check: async ({ w: world_, lich }, override, summary, tally) => {
          expect(override.step1).toMatchObject({ kind: 'ok' });
          expect(override.step2).toMatchObject({ kind: 'ok' });
          // Kết thúc ở DaXacNhan, KHÔNG BAO GIỜ VangMat (đó là lỗi mà B18 chặn: job đánh lại lịch vừa được khôi phục)
          expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
            'DaXacNhan',
          );
          const audit = await readAudit(db);
          expect(audit).toHaveLength(2);
          const noShow = await readNoShow(db, world_.patientId);
          expect(noShow.khoa).toBe(false);
          if (noShow.soLan === 1) {
            // job thắng: đánh TRƯỚC lệnh đầu của Admin (nên lệnh đó đi từ VangMat)
            expect(summary).toEqual({ ...ZERO, noShowed: 1 });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'VangMat',
                'DaTiepDon',
              ),
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaTiepDon',
                'DaXacNhan',
              ),
            ]);
            expect(await eventsOf()).toEqual([NO_SHOW]);
            tally.add('job đánh Vắng mặt trước lệnh đầu của Admin');
          } else {
            expect(noShow).toEqual({ soLan: 0, khoa: false });
            expect(audit).toMatchObject([
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaXacNhan',
                'DaTiepDon',
              ),
              expectedAudit(
                world_,
                'Toan',
                lich.lichHenId,
                'DaTiepDon',
                'DaXacNhan',
              ),
            ]);
            expect(await eventsOf()).toEqual([]);
            // Job không đánh: ba cách, tuỳ lúc nó chọn và lúc nó khoá so với hai lệnh của Admin
            if (summary?.notDue === 1) {
              expect(summary).toEqual({ ...ZERO, notDue: 1 });
              tally.add(
                'Admin thắng; job chọn lịch rồi kiểm LẠI dưới khoá thấy override (notDue)',
              );
            } else if (summary?.notConfirmed === 1) {
              expect(summary).toEqual({ ...ZERO, notConfirmed: 1 });
              tally.add(
                'Admin thắng; job chọn lịch rồi thấy đang DaTiepDon (notConfirmed)',
              );
            } else {
              expect(summary).toEqual(ZERO);
              tally.add('Admin thắng; job không chọn lịch');
            }
          }
          await assertBookingInvariants(db);
        },
      });
    },
    SLOW,
  );
});

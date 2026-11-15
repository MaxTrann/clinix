import { vi } from 'vitest';
import {
  retryStats,
  reportRounds,
  winnerTally,
} from '../../../appointments/testing/concurrency-report.js';
import { assertBookingInvariants } from '../../../appointments/testing/invariants.js';
import {
  createOverrideStack,
  overrideBy,
  resetOverrideRound,
  settle,
} from '../../../appointments/testing/override-world.js';
import { raceRounds } from '../../../appointments/testing/override-race.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { setNoShow } from '../../../appointments/testing/status-world.js';
import {
  countRows,
  examCompletionStack,
  thongBaoRows,
} from '../testing/exam-completion-stack.js';
import {
  EXAM_RACE_ROUNDS,
  runExamRounds,
} from '../testing/exam-concurrency.js';
import { assertExamInvariants } from '../testing/exam-invariants.js';
import { recordBody, recordService } from '../testing/exam-record-stack.js';

// doctor-exam B1 — các ca ĐỒNG THỜI của hoàn thành ca khám trên MySQL 8.4 THẬT (PLAN 5.3, 7.8 DHK-01, DHK-09; DHK-02 của B2 (thay DHK-12 `[đề xuất]` mô phỏng của B1); X1 M1, M4, M12). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình int;
// không chạy cùng lúc với ca nặng khác). Mỗi vòng: dữ liệu SẠCH, hai bên cùng xuất phát (`racePair`, xen kẽ ai đi trước), IVK-01…IVK-05 và INV-01…INV-05 sau vòng, rồi IN một dòng `[B1-DHK]` (số vòng, bên thắng,
// số lần thử lại 1213/1205 theo nhãn, số yêu cầu hết lượt 503). DỰ ĐOÁN (ghi trước khi chạy, TRACKING 12.7; lệch thì GHI, không sửa dự đoán): P1 DHK-01 và DHK-02: 0 lần thử lại, 0 × 503 (X1 M1, M12: chuỗi khoá
// `lich_hen` X trước mọi ghi); P2 DHK-09: có thể ≥ 1 lần 1213 ở bên override (chu trình đã đo ở X1 M4: 8/56 vòng), thử lại thành công, 503 = 0 (`retriesAllowed`); P3 mọi ca: đúng một thông báo cho mỗi lịch HoanThanh.
const TAG = 'B1-DHK';
const SLOW = 600_000;
const COMPLETED = 'LichHenHoanThanh';
const BUSY = 'HE_THONG_DANG_BAN';

useStatusWorldHooks();

/** Dọn giữa các vòng: hồ sơ khám (khoá ngoại tới lịch) và nhật ký trước, rồi như `resetBookingRound` + nhật ký (qua `resetOverrideRound`). */
async function resetRound(): Promise<void> {
  await db.query('DELETE FROM ho_so_kham');
  await resetOverrideRound(db);
}

describe('DHK-01 hai lần hoàn thành cùng lịch (hai tab bấm đúp): đúng MỘT thành công, một 409; một thông báo; 0 lần thử lại', () => {
  it(
    `${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const w = await world();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          const lich = await w.booked('DaTiepDon', 0);
          return { lich, service: examCompletionStack(db).service };
        },
        race: ({ lich, service }, round) =>
          racePair(
            round,
            () =>
              settle(
                service.complete(w.doctor.account.taiKhoanId, lich.maLichHen),
              ),
            () =>
              settle(
                service.complete(w.doctor.account.taiKhoanId, lich.maLichHen),
              ),
          ),
        check: async ({ lich }, results) => {
          const outcomes = results.map((result) => {
            if (result.status === 'rejected')
              throw new Error(`yêu cầu ném lỗi: ${String(result.reason)}`);
            return result.value;
          });
          const ok = outcomes.filter((outcome) => outcome.kind === 'ok');
          const refused = outcomes.filter(
            (outcome) => outcome.kind === 'refused',
          );
          expect(ok).toHaveLength(1);
          expect(refused).toEqual([
            {
              kind: 'refused',
              maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
              chiTiet: { tuTrangThai: 'HoanThanh', denTrangThai: 'HoanThanh' },
            },
          ]);
          expect(
            (await w.snapshot(lich, 0)).row.trangThai,
            'lịch phải HoanThanh',
          ).toBe('HoanThanh');
          expect(await thongBaoRows(db, COMPLETED)).toHaveLength(1);
          tally.add(outcomes[0]?.kind === 'ok' ? 'tab1' : 'tab2');
        },
      });
      reportRounds(TAG, 'DHK-01', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );
});

describe('DHK-09 hoàn thành THẬT đua override Quản trị viên THẬT DaTiepDon → VangMat: đúng một kết quả hợp lệ; 1213 thử lại được; 503 = 0', () => {
  it(
    '56 vòng (40 xen kẽ + 16 quét độ lệch, như X1 M4 và booking B14)',
    async () => {
      const w = await world();
      await raceRounds({
        tag: TAG,
        name: 'DHK-09',
        logs,
        setup: async () => {
          await resetRound();
          await setNoShow(db, w.patientId, { soLan: 0, khoa: false });
          const lich = await w.booked('DaTiepDon', 0);
          const stack = createOverrideStack(db);
          const { service } = examCompletionStack(db, { stack });
          return { lich, stack, service };
        },
        first: ({ lich, service }) =>
          settle(service.complete(w.doctor.account.taiKhoanId, lich.maLichHen)),
        second: ({ lich, stack }) =>
          settle(overrideBy(w, stack, 'Toan', lich.maLichHen, 'VangMat')),
        check: async ({ lich }, complete, override, tally) => {
          for (const side of [complete, override])
            if (side.kind === 'refused')
              expect(side.maLoi, 'không được hết lượt (503)').not.toBe(BUSY);
          const state = (await w.snapshot(lich, 0)).row.trangThai;
          const notices = await thongBaoRows(db, COMPLETED);
          if (complete.kind === 'ok') {
            // hoàn thành thắng: lịch HoanThanh, một thông báo; override bị từ chối vì HoanThanh không đi ra được
            expect(state).toBe('HoanThanh');
            expect(override).toMatchObject({
              kind: 'refused',
              maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
            });
            expect(notices).toHaveLength(1);
            tally.add('complete');
          } else {
            // override thắng: lịch VangMat, KHÔNG có thông báo hoàn thành; hoàn thành nhận 409 với tuTrangThai VangMat
            expect(state).toBe('VangMat');
            expect(override.kind).toBe('ok');
            expect(complete).toMatchObject({
              kind: 'refused',
              maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
              chiTiet: { tuTrangThai: 'VangMat', denTrangThai: 'HoanThanh' },
            });
            expect(notices).toHaveLength(0);
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

// DHK-02 (doctor-exam B2; PLAN 7.8; X1 M1 chạy lại với service THẬT): `complete` THẬT của B1 đua `PUT exam-record` THẬT của B2 cùng một lịch `DaTiepDon`. Thay DHK-12 `[đề xuất, B1]` vốn dùng chuỗi PUT MÔ PHỎNG
// (`simulatedPut`, đã xoá). Bên PUT trả bản hồ sơ; nhật ký `SuaGhiChuKham` có IFF PUT chạy SAU hoàn thành VÀ đã có hồ sơ (chỉ ca (b)). Dự đoán P1 của B1 vẫn áp dụng: 0 lần thử lại, 0 × 503.
describe('DHK-02 hoàn thành THẬT đua PUT hồ sơ THẬT cùng lịch DaTiepDon (X1 M1 chạy lại với service thật, có INSERT thong_bao và nhật ký): cả hai thành công, 0 lần thử lại', () => {
  it.each([
    ['(a) chưa có hồ sơ', false],
    ['(b) đã có hồ sơ', true],
  ])(
    `${String(EXAM_RACE_ROUNDS)} vòng %s`,
    async (name, hasRecord) => {
      vi.setSystemTime(new Date('2026-11-10T09:00:00+07:00'));
      const w = await world();
      const put = recordService(db);
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRound();
          const lich = await w.booked('DaTiepDon', 0);
          if (hasRecord)
            await db.query(
              'INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, cap_nhat_lan_cuoi) VALUES (?, ?, ?, ?, ?)',
              [lich.lichHenId, 'Ho', 'Viêm họng', 'Cũ', '2026-11-10 08:00:00'],
            );
          return { lich, service: examCompletionStack(db).service };
        },
        race: ({ lich, service }, round) =>
          racePair(
            round,
            () => service.complete(w.doctor.account.taiKhoanId, lich.maLichHen),
            () =>
              put.save(
                w.doctor.account.taiKhoanId,
                lich.maLichHen,
                recordBody({
                  trieuChung: 'Ho',
                  chanDoanSoBo: 'Viêm họng',
                  huongXuLy: 'Nghỉ ngơi',
                  capNhatLanCuoi: hasRecord ? '2026-11-10T01:00:00.000Z' : null,
                }),
              ),
          ),
        check: async ({ lich }, results) => {
          const [complete, saved] = results.map((result) => {
            if (result.status === 'rejected')
              throw new Error(`yêu cầu ném lỗi: ${String(result.reason)}`);
            return result.value;
          }) as unknown as [{ trangThai: string }, { huongXuLy: string }];
          expect(complete.trangThai).toBe('HoanThanh');
          expect(saved.huongXuLy).toBe('Nghỉ ngơi');
          expect((await w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
          expect(await countRows(db, 'ho_so_kham')).toBe(1);
          expect(await thongBaoRows(db, COMPLETED)).toHaveLength(1);
          // nhật ký có IFF PUT chạy sau hoàn thành VÀ đã có hồ sơ (chỉ ca (b)); IVK-04 kiểm khớp trạng thái ở `runExamRounds`
          const audits = await countRows(db, 'nhat_ky_hanh_dong');
          if (!hasRecord) expect(audits).toBe(0);
          expect(audits).toBeLessThanOrEqual(1);
          // Nhãn là thứ QUAN SÁT ĐƯỢC: có dòng nhật ký (PUT chạy sau hoàn thành, chỉ xảy ra ở ca (b)) hay không. Ở ca (a) không có hồ sơ cũ nên PUT không bao giờ ghi nhật ký: nhãn không nói ai đi trước.
          tally.add(audits === 1 ? 'co-nhat-ky' : 'khong-nhat-ky');
        },
      });
      reportRounds(
        TAG,
        `DHK-02 ${name}`,
        EXAM_RACE_ROUNDS,
        tally.winners,
        logs,
      );
      expect(retryStats(logs).exhausted).toBe(0);
    },
    SLOW,
  );
});

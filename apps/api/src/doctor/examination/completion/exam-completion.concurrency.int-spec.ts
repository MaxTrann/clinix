import type { DataSource, EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
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
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { editRecordEntry } from '../../../audit/testing/exam-audit-entries.js';
import { nowVN, toSecond } from '../../../common/time/time.js';
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

// doctor-exam B1 — các ca ĐỒNG THỜI của hoàn thành ca khám trên MySQL 8.4 THẬT (PLAN 5.3, 7.8 DHK-01, DHK-09; DHK-12 `[đề xuất]`; X1 M1, M4, M12). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình int;
// không chạy cùng lúc với ca nặng khác). Mỗi vòng: dữ liệu SẠCH, hai bên cùng xuất phát (`racePair`, xen kẽ ai đi trước), IVK-01…IVK-05 và INV-01…INV-05 sau vòng, rồi IN một dòng `[B1-DHK]` (số vòng, bên thắng,
// số lần thử lại 1213/1205 theo nhãn, số yêu cầu hết lượt 503). DỰ ĐOÁN (ghi trước khi chạy, TRACKING 12.7; lệch thì GHI, không sửa dự đoán): P1 DHK-01 và DHK-12: 0 lần thử lại, 0 × 503 (X1 M1, M12: chuỗi khoá
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

// Chuỗi PUT hồ sơ MÔ PHỎNG đúng PLAN 5.3 (B2 chưa có): khoá `lich_hen` X theo khoá chính → kiểm bác sĩ và trạng thái dưới khoá → `ho_so_kham` X theo `lich_hen_id` → INSERT hoặc UPDATE → nhật ký
// `SuaGhiChuKham` (AuditService THẬT) khi lịch đã HoanThanh và đã có hồ sơ. Cùng vỏ `withBookingTransaction` như B2 sẽ dùng. B2 thay ca này bằng DHK-02 với service thật rồi xoá phần mô phỏng.
async function simulatedPut(
  database: DataSource,
  input: { lichHenId: string; bacSiId: string; chiNhanhId: string },
) {
  const audit = new AuditService(new AuditRepository());
  return withBookingTransaction(
    database,
    async (em: EntityManager) => {
      const locked: { bacSiId: string; trangThai: string }[] = await em.query(
        'SELECT CAST(bac_si_id AS CHAR) AS bacSiId, trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
        [input.lichHenId],
      );
      const lich = locked[0];
      if (lich?.bacSiId !== input.bacSiId) return { kind: 'NotFound' as const };
      if (lich.trangThai !== 'DaTiepDon' && lich.trangThai !== 'HoanThanh')
        return { kind: 'WrongState' as const };
      const existing: { id: string; huongXuLy: string }[] = await em.query(
        'SELECT CAST(ho_so_kham_id AS CHAR) AS id, huong_xu_ly AS huongXuLy FROM ho_so_kham WHERE lich_hen_id = ? FOR UPDATE',
        [input.lichHenId],
      );
      const now = toSecond(nowVN());
      const found = existing[0];
      if (found === undefined) {
        await em.query(
          'INSERT INTO ho_so_kham (lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, cap_nhat_lan_cuoi) VALUES (?, ?, ?, ?, ?)',
          [input.lichHenId, 'Ho khan', 'Viêm họng', 'Uống nước ấm', now],
        );
        return { kind: 'Saved' as const, edited: false };
      }
      await em.query(
        'UPDATE ho_so_kham SET huong_xu_ly = ?, cap_nhat_lan_cuoi = ? WHERE ho_so_kham_id = ?',
        ['Nghỉ ngơi', now, found.id],
      );
      const edited = lich.trangThai === 'HoanThanh';
      if (edited)
        await audit.record(
          em,
          editRecordEntry({
            actorId: input.bacSiId,
            branchId: input.chiNhanhId,
            targetId: found.id,
            changes: {
              truoc: { huong_xu_ly: found.huongXuLy },
              sau: { huong_xu_ly: 'Nghỉ ngơi' },
            },
          }),
        );
      return { kind: 'Saved' as const, edited };
    },
    { label: 'exam-record-sim' },
  );
}

describe('DHK-12 [đề xuất] hoàn thành THẬT đua chuỗi PUT hồ sơ MÔ PHỎNG cùng lịch DaTiepDon (X1 M1 chạy lại với service thật, có INSERT thong_bao): cả hai thành công, 0 lần thử lại', () => {
  it.each([
    ['(a) chưa có hồ sơ', false],
    ['(b) đã có hồ sơ', true],
  ])(
    `${String(EXAM_RACE_ROUNDS)} vòng %s`,
    async (name, hasRecord) => {
      const w = await world();
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
              simulatedPut(db, {
                lichHenId: lich.lichHenId,
                bacSiId: w.doctor.account.taiKhoanId,
                chiNhanhId: w.branch.chiNhanhId,
              }),
          ),
        check: async ({ lich }, results) => {
          const [complete, put] = results.map((result) => {
            if (result.status === 'rejected')
              throw new Error(`yêu cầu ném lỗi: ${String(result.reason)}`);
            return result.value;
          }) as [{ trangThai: string }, { kind: string; edited?: boolean }];
          expect(complete.trangThai).toBe('HoanThanh');
          expect(put.kind).toBe('Saved');
          expect((await w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
          expect(await countRows(db, 'ho_so_kham')).toBe(1);
          expect(await thongBaoRows(db, COMPLETED)).toHaveLength(1);
          // nhật ký có IFF PUT chạy sau hoàn thành VÀ đã có hồ sơ (chỉ ca (b)); IVK-04 kiểm khớp trạng thái ở `runExamRounds`
          expect(await countRows(db, 'nhat_ky_hanh_dong')).toBe(
            put.edited === true ? 1 : 0,
          );
          // Nhãn là thứ QUAN SÁT ĐƯỢC: có dòng nhật ký (PUT chạy sau hoàn thành, chỉ xảy ra ở ca (b)) hay không. Ở ca (a) không có hồ sơ cũ nên PUT không bao giờ ghi nhật ký: nhãn không nói ai đi trước.
          tally.add(put.edited === true ? 'co-nhat-ky' : 'khong-nhat-ky');
        },
      });
      reportRounds(
        TAG,
        `DHK-12 ${name}`,
        EXAM_RACE_ROUNDS,
        tally.winners,
        logs,
      );
      expect(retryStats(logs).exhausted).toBe(0);
    },
    SLOW,
  );
});

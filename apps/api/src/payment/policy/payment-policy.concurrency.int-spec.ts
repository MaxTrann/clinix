import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  createGate,
  runRounds,
  tallyOutcomes,
} from '../../appointments/testing/concurrency-harness.js';
import {
  createAppointmentWorld,
  lichHenRows,
  resetBookingData,
} from '../../appointments/testing/create-appointment-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  SYSTEM_SCOPE,
  adminServiceOf,
  policyBody,
  policyService,
  type Tier,
} from '../testing/policy-kit.js';

// payment B10 — ca ĐỒNG THỜI của cấu hình chính sách cọc trên MySQL 8.4 THẬT (PLAN payment 7.1, 7.x DTT; 5.3; 5.15 M15): CSD-16 và DTT-14 (hai PUT cùng dịch vụ; `create` đọc mốc trong lúc PUT),
// CSD-19 (PUT tăng cọc đua với Quản trị viên hạ giá), và số đo M15 (300 vòng). Mỗi vòng dựng lại dữ liệu, các bên xuất phát qua một cổng (`createGate`), rồi kiểm. Ca NHẠY VỚI TẢI: chạy MỘT MÌNH trên MySQL.
// PUT chạy READ COMMITTED như `ServiceService.update` (không có `withBookingTransaction`): 1213 hay 1205 còn sót là lỗi của ca (đây chỉ xin MỘT khoá nên không được có). Dữ liệu giả.
const ROUNDS = 40;
const M15_ROUNDS = 300;
const TIMEOUT = 600_000;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const system = SYSTEM_SCOPE;
const policies = () => policyService(db);
const adminServices = () => adminServiceOf(db);
const body = policyBody;

const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Các việc cùng xuất phát qua một cổng; việc thứ hai trễ `delay` ms (xen kẽ thứ tự giữa các vòng). */
const together = <T>(
  tasks: readonly (() => Promise<T>)[],
  delays: readonly number[] = [],
) => {
  const gate = createGate(tasks.length);
  return tasks.map((task, index) => async () => {
    await gate.arrive();
    if ((delays[index] ?? 0) > 0) await sleepMs(delays[index]!);
    return task();
  });
};

/** Đếm số lần `withBookingTransaction` ĐÃ thử lại (chỉ `create` dùng nó): số này ghi ra stderr cho M15. */
function watchRetries() {
  const messages: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    if (typeof message === 'string' && /MySQL (1213|1205)/.test(message))
      messages.push(message);
  });
  return () => messages.length;
}

async function stored(serviceId: string) {
  const [row]: { coc: string; gia: string }[] = await db.query(
    'SELECT CAST(muc_dat_coc AS CHAR) AS coc, CAST(gia_mac_dinh AS CHAR) AS gia FROM dich_vu_kham WHERE dich_vu_kham_id = ?',
    [serviceId],
  );
  const moc: Tier[] = (
    await db.query(
      'SELECT so_gio_truoc_toi_thieu AS g, ty_le_hoan AS t FROM moc_hoan_tien WHERE dich_vu_kham_id = ? ORDER BY so_gio_truoc_toi_thieu DESC',
      [serviceId],
    )
  ).map((m: { g: number; t: number }) => [m.g, m.t] as Tier);
  return { coc: row!.coc, gia: row!.gia, moc };
}

describe('CSD-16, DTT-14 hai PUT cùng dịch vụ đồng thời (40 vòng)', () => {
  it(
    'kết quả luôn là MỘT bản trọn vẹn (cọc VÀ bộ mốc của cùng một PUT), không trộn mốc của hai PUT; cả hai PUT đều thành công; 0 deadlock, 0 hết giờ chờ khoá',
    async () => {
      const w = await fx.world();
      const id = w.doctor.profile.dichVuKhamId;
      const A = {
        coc: '100000.00',
        moc: [
          [24, 100],
          [2, 50],
          [0, 0],
        ] as Tier[],
      };
      const B = {
        coc: '30000.00',
        moc: [
          [72, 90],
          [6, 20],
        ] as Tier[],
      };
      const winners = { A: 0, B: 0 };

      const all = await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          await db.query(
            "UPDATE dich_vu_kham SET muc_dat_coc = '0.00' WHERE dich_vu_kham_id = ?",
            [id],
          );
          await db.query(
            'DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id = ?',
            [id],
          );
        },
        race: (_context, round) =>
          together(
            [
              () => policies().replace(system, id, body('100000', A.moc)),
              () => policies().replace(system, id, body('30000', B.moc)),
            ],
            [0, round % 3],
          ),
        check: async () => {
          const now = await stored(id);
          const isA =
            now.coc === A.coc &&
            JSON.stringify(now.moc) === JSON.stringify(A.moc);
          const isB =
            now.coc === B.coc &&
            JSON.stringify(now.moc) === JSON.stringify(B.moc);
          // Đúng MỘT bản trọn vẹn: cọc của A đi với mốc của A, hoặc cọc của B đi với mốc của B
          expect(isA || isB, `trạng thái trộn: ${JSON.stringify(now)}`).toBe(
            true,
          );
          if (isA) winners.A += 1;
          else winners.B += 1;
        },
      });

      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `CSD-16/DTT-14: ${String(ROUNDS)} vòng; thành công=${String(sum.ok)}/${String(sum.total)}; bản cuối A=${String(winners.A)} B=${String(winners.B)}; 1213=${String(sum.deadlocks)} 1205=${String(sum.lockTimeouts)}\n`,
      );
      expect(sum).toMatchObject({
        total: ROUNDS * 2,
        ok: ROUNDS * 2,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
    },
    TIMEOUT,
  );
});

describe('CSD-19 PUT tăng cọc đua với Quản trị viên hạ giá cùng dịch vụ (40 vòng)', () => {
  it(
    'đúng MỘT bên thắng, bên kia nhận lỗi đúng mã (409 GIA_DUOI_MUC_COC hay 400 MUC_COC_VUOT_GIA); sau cả hai luôn cọc ≤ giá; 0 deadlock',
    async () => {
      const w = await fx.world();
      const id = w.doctor.profile.dichVuKhamId;
      const outcome = { putThang: 0, haGiaThang: 0 };

      const all = await runRounds({
        rounds: ROUNDS,
        // Giá 200.000, cọc 0: tăng cọc lên 150.000 (≤ giá) và hạ giá xuống 100.000 (< cọc mới) KHÔNG thể cùng thành công
        setup: async () => {
          await db.query(
            "UPDATE dich_vu_kham SET gia_mac_dinh = '200000.00', muc_dat_coc = '0.00' WHERE dich_vu_kham_id = ?",
            [id],
          );
          await db.query(
            'DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id = ?',
            [id],
          );
        },
        race: (_context, round) =>
          together<unknown>(
            [
              () => policies().replace(system, id, body('150000', [[24, 100]])),
              () =>
                adminServices().update(system, id, { giaMacDinh: '100000' }),
            ],
            // Xen kẽ bên bị trễ 2 đến 4 ms: vòng chẵn hạ giá xuất phát muộn, vòng lẻ PUT xuất phát muộn (để cả hai thứ tự có cơ hội xảy ra)
            round % 2 === 0 ? [0, 2 + (round % 3)] : [2 + (round % 3), 0],
          ),
        check: async (_context, results) => {
          const [put, lower] = results;
          const now = await stored(id);
          // Bất biến cốt lõi (4.7 #1): luôn cọc ≤ giá
          expect(BigInt(now.coc.split('.')[0]!)).toBeLessThanOrEqual(
            BigInt(now.gia.split('.')[0]!),
          );

          const failedCode = (r: PromiseSettledResult<unknown> | undefined) =>
            r?.status === 'rejected'
              ? (r.reason as { maLoi?: string }).maLoi
              : null;
          if (put?.status === 'fulfilled') {
            // PUT trước: cọc 150.000, giá 200.000 rồi hạ giá bị chặn
            expect(failedCode(lower)).toBe('GIA_DUOI_MUC_COC');
            expect(now).toMatchObject({ coc: '150000.00', gia: '200000.00' });
            outcome.putThang += 1;
          } else {
            // Hạ giá trước: giá 100.000 rồi cọc 150.000 vượt giá bị chặn
            expect(lower?.status).toBe('fulfilled');
            expect(failedCode(put)).toBe('CHINH_SACH_COC_KHONG_HOP_LE');
            expect(now).toMatchObject({ coc: '0.00', gia: '100000.00' });
            outcome.haGiaThang += 1;
          }
        },
      });

      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `CSD-19: ${String(ROUNDS)} vòng; bên thắng ${JSON.stringify(outcome)}; lỗi ${JSON.stringify(sum.byCode)}; 1213=${String(sum.deadlocks)} 1205=${String(sum.lockTimeouts)}\n`,
      );
      expect(sum).toMatchObject({
        total: ROUNDS * 2,
        ok: ROUNDS,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
      // KHÔNG khẳng định cả hai thứ tự đều xảy ra: bên nào xong trước phụ thuộc tải máy (trên CI, PUT thắng cả 40 vòng nên khẳng định đó đỏ, 17/11/2026). Mỗi thứ tự đã có ca tất định riêng:
      // PUT trước rồi hạ giá bị chặn ở CSD-18; hạ giá trước rồi cọc vượt giá bị chặn ở CSD-04. Ca này chỉ khẳng định bất biến cọc ≤ giá và 'đúng một bên thắng' ở MỌI vòng, kể cả thứ tự nào.
      expect(outcome.putThang + outcome.haGiaThang).toBe(ROUNDS);
    },
    TIMEOUT,
  );
});

describe('DTT-14, M15 `create` của booking đọc `moc_hoan_tien` trong lúc PUT thay mốc (300 vòng)', () => {
  it(
    'mốc trong snapshot luôn là MỘT bộ trọn vẹn (của bản cũ hoặc bản mới), không bao giờ nửa chừng; `create` luôn thành công, 0 deadlock; số vòng cọc và mốc lệch phiên bản được ĐẾM và ghi',
    async () => {
      const w = await createAppointmentWorld(db, fx);
      const id = w.dichVuKhamId;
      const retries = watchRetries();
      const OLD = {
        coc: '100000.00',
        moc: [
          [24, 100],
          [2, 50],
          [0, 0],
        ] as Tier[],
      };
      const NEW = {
        coc: '50000.00',
        moc: [
          [12, 60],
          [1, 10],
        ] as Tier[],
      };
      const seen = { old: 0, neu: 0, lech: 0 };

      const all = await runRounds({
        rounds: M15_ROUNDS,
        setup: async () => {
          await resetBookingData(db);
          await w.deposit(OLD.coc, OLD.moc);
        },
        race: (_context, round) =>
          together<unknown>(
            [
              () => policies().replace(system, id, body('50000', NEW.moc)),
              () => w.create(0),
            ],
            [round % 3 === 0 ? 1 : 0, round % 2],
          ),
        check: async (_context, results) => {
          for (const result of results)
            expect(result.status, JSON.stringify(result)).toBe('fulfilled');
          const [row] = await lichHenRows(db);
          const tiers = (
            row!.chinhSach as {
              so_gio_truoc_toi_thieu: number;
              ty_le_hoan: number;
            }[]
          ).map((m) => [m.so_gio_truoc_toi_thieu, m.ty_le_hoan] as Tier);
          const isOld = JSON.stringify(tiers) === JSON.stringify(OLD.moc);
          const isNew = JSON.stringify(tiers) === JSON.stringify(NEW.moc);
          // M15: không bao giờ thấy trạng thái nửa chừng (mảng rỗng giữa DELETE và INSERT, hay thiếu mốc)
          expect(
            isOld || isNew,
            `mốc nửa chừng: ${JSON.stringify(tiers)}`,
          ).toBe(true);
          if (isOld) seen.old += 1;
          else seen.neu += 1;
          // Thông tin đo thêm (không khẳng định): cọc và mốc chụp ở HAI câu đọc riêng nên có thể thuộc hai phiên bản khác nhau
          const cocIsOld = row!.coc === OLD.coc;
          if (cocIsOld !== isOld) seen.lech += 1;
        },
      });

      const sum = tallyOutcomes(all.flat());
      process.stderr.write(
        `M15: ${String(M15_ROUNDS)} vòng; snapshot mốc cũ=${String(seen.old)} mới=${String(seen.neu)}; nửa chừng=0; cọc/mốc lệch phiên bản=${String(seen.lech)}; thử lại create=${String(retries())}; 1213=${String(sum.deadlocks)} 1205=${String(sum.lockTimeouts)}\n`,
      );
      expect(sum).toMatchObject({
        total: M15_ROUNDS * 2,
        ok: M15_ROUNDS * 2,
        deadlocks: 0,
        lockTimeouts: 0,
        other: [],
      });
    },
    TIMEOUT,
  );
});

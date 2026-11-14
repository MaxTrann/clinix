import { holdRowLock, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  valuesOf,
  winnerTally,
} from '../testing/concurrency-report.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { waitUntilWaiting } from '../testing/lock-wait.js';
import { cancelInput, DEPOSIT } from '../testing/cancel-world.js';
import {
  createRealNotifierStack,
  readEmails,
  readThongBao,
  resetNotificationRound,
  runConfirmPaid,
} from '../testing/notification-world.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import {
  noShowInput,
  readNoShow,
  runNoShow,
  setNoShow,
  type StatusWorld,
} from '../testing/status-world.js';

// Task B15 — NTF-10: khoá của thông báo THẬT, ĐỒNG THỜI, chạy MỘT MÌNH (PLAN booking 5.3, 7.43; TRACKING 3.37 B15-G). Đo ba lõi: huỷ, `confirmPaid`, `markNoShow` kèm khoá (đường tạo cọc 0đ của B8 chưa có ca).
//
// DỰ ĐOÁN (ghi TRƯỚC khi đo, TRACKING 3.37 B15-G (i), (ii)): `INSERT INTO thong_bao` xin khoá S trên hàng cha `tai_khoan` của NGƯỜI ĐẶT (khoá ngoại), SAU khi lõi đã giữ lịch (tầng 6, hoặc `benh_nhan` rồi `lich_hen`
// ở `markNoShow`). Không luồng nào giữ `tai_khoan` rồi xin `lich_hen` hay `benh_nhan` (grep `FOR UPDATE` trên `src/`: `tai_khoan` chỉ bị khoá ở `auth`, cùng `phien_dang_nhap` và `ma_xac_thuc`). Nên một kết nối GIỮ X trên
// hàng `tai_khoan` của người đặt (như một lượt đăng nhập của `auth`) làm lõi CHỜ đúng ở bảng `tai_khoan`, và khi nhả thì lõi XONG đúng, KHÔNG deadlock 1213 và không hết giờ chờ 1205 (bên giữ khoá không xin gì của lõi).
// ĐO (14/11/2026, MySQL 8.4, 1 lượt mỗi lõi): cả ba lõi bị chặn ở bảng `tai_khoan` (`waitUntilWaiting`), chưa xong khi còn bị giữ, xong đúng sau khi nhả, không dòng log 1213 hay 1205: KHỚP dự đoán. Ca này chỉ khẳng định
// điều đó; nó không đo "không chờ ở bảng khác" (bên giữ khoá chỉ giữ hàng `tai_khoan` nên không thể chặn bảng khác). Nếu số đo LỆCH thì GHI vào TRACKING, không sửa dự đoán ở đây.
useStatusWorldHooks();

const holdPatientAccount = (w: StatusWorld) =>
  holdRowLock(
    db,
    'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
    [w.patientId],
  );

const noDeadlock = () =>
  expect(logs.filter((line) => /MySQL 12(?:13|05)/.test(line))).toEqual([]);

describe('NTF-10 giữ X trên hàng tai_khoan của người đặt (như auth): lõi CHỜ ở tai_khoan rồi xong khi nhả; không 1213, không 1205', () => {
  const CASES: [
    string,
    (
      w: StatusWorld,
      stack: ReturnType<typeof createRealNotifierStack>,
    ) => Promise<() => Promise<unknown>>,
    (w: StatusWorld) => Promise<void>,
  ][] = [
    [
      'cancel',
      async (w, stack) => {
        const lich = await w.booked('DaXacNhan', 0);
        return () =>
          stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
      },
      async () => {
        const rows = await readThongBao(db, 'LichHenDaHuy');
        expect(rows).toHaveLength(1);
      },
    ],
    [
      'confirmPaid',
      async (w, stack) => {
        const lich = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
        return () => runConfirmPaid(db, stack.transition, lich.lichHenId);
      },
      async () => {
        expect(await readThongBao(db, 'LichHenDaXacNhan')).toHaveLength(1);
      },
    ],
    [
      'markNoShow (kèm khoá)',
      async (w, stack) => {
        await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
        const lich = await w.booked('DaXacNhan', 0);
        return () =>
          runNoShow(
            db,
            stack.transition,
            noShowInput(w, lich.lichHenId, 'LeTan'),
          );
      },
      async (w) => {
        expect((await readThongBao(db)).map((row) => row.loai).sort()).toEqual([
          'KhoaDatLichNoShow',
          'LichHenVangMat',
        ]);
        expect(await readNoShow(db, w.patientId)).toEqual({
          soLan: 3,
          khoa: true,
        });
      },
    ],
  ];

  it.each(CASES)(
    '%s',
    async (_core, prepare, expectDone) => {
      const w = await world();
      const stack = createRealNotifierStack(db);
      const run = await prepare(w, stack);
      const held = await holdPatientAccount(w);
      let finished = false;
      let started: Promise<unknown>;
      try {
        started = run().finally(() => {
          finished = true;
        });
        // lõi bị CHẶN ở hàng tai_khoan (câu INSERT thong_bao xin khoá S cho khoá ngoại), chưa xong
        await waitUntilWaiting(db, 'tai_khoan', 1);
        expect(finished).toBe(false);
      } finally {
        await held.release('rollback');
      }
      await started;
      expect(finished).toBe(true);
      await expectDone(w);
      noDeadlock();
    },
    30_000,
  );
});

// NTF-11: hai lần huỷ CÙNG một lịch, mỗi bên một bản API (hai bộ dịch vụ), xen kẽ ai đi trước (`racePair`), thông báo THẬT. DỰ ĐOÁN (ghi TRƯỚC khi đo): hai bên tuần tự hoá ở khoá `khung_gio` (tầng 5, trước `lich_hen`), nên
// đúng MỘT bên `Cancelled`, bên kia `AlreadyCancelled` TRƯỚC khi ghi gì; đúng MỘT dòng `thong_bao` và MỘT dòng `email_thong_bao` mỗi vòng; 0 lần thử lại 1213 hay 1205 (khoá chia sẻ trên `tai_khoan` của thông báo
// không bao giờ tranh nhau vì chỉ bên thắng tới được bước ghi).
const NTF_11_ROUNDS = 40;

describe('NTF-11 hai lần huỷ cùng một lịch đồng thời (hai bản API): đúng MỘT thông báo và MỘT email', () => {
  it(`${String(NTF_11_ROUNDS)} vòng: một bên Cancelled, bên kia AlreadyCancelled; đúng 1 dòng thong_bao LichHenDaHuy và 1 dòng email_thong_bao; không thử lại 1213 hay 1205; INV`, async () => {
    const w = await world();
    const tally = winnerTally();
    await runRounds({
      rounds: NTF_11_ROUNDS,
      setup: async () => {
        await resetNotificationRound(db);
        return {
          lich: await w.booked('DaXacNhan', 0),
          apiA: createRealNotifierStack(db),
          apiB: createRealNotifierStack(db),
        };
      },
      race: ({ lich, apiA, apiB }, round) =>
        racePair(
          round,
          () =>
            apiA.cancellation.cancel(
              cancelInput(w, 'BenhNhan', lich.maLichHen),
            ),
          () =>
            apiB.cancellation.cancel(cancelInput(w, 'LeTan', lich.maLichHen)),
        ),
      check: async (_context, results) => {
        const [patient, staff] = valuesOf(results);
        expect([patient?.kind, staff?.kind].sort()).toEqual([
          'AlreadyCancelled',
          'Cancelled',
        ]);
        tally.add(patient?.kind === 'Cancelled' ? 'BenhNhan' : 'LeTan');
        expect(await readThongBao(db, 'LichHenDaHuy')).toHaveLength(1);
        expect(await readThongBao(db)).toHaveLength(1);
        expect(await readEmails(db)).toHaveLength(1);
        await assertBookingInvariants(db);
      },
    });
    reportRounds('B15-NTF-11', 'NTF-11', NTF_11_ROUNDS, tally.winners, logs);
  }, 120_000);
});

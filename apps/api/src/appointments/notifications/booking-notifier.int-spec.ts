import { EmailThongBao } from '../../admin/entities/email-thong-bao.entity.js';
import { ThongBao } from '../../admin/entities/thong-bao.entity.js';
import { isForeignKeyError } from '../../database/mysql-errors.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  atRemaining,
  cancelInput,
  cancelledOutcome,
  DEPOSIT,
  HALF_REFUND,
  HOUR_MS,
  REFUND_POLICY,
  T0_TEXT,
  type CancelRole,
} from '../testing/cancel-world.js';
import { BOOKING_T0 } from '../testing/booking-fixtures.js';
import { createExpiryStack } from '../testing/expiry-fixtures.js';
import { FakeAppointmentNotifier } from '../testing/fake-ports.js';
import {
  createRealCreateService,
  createRealNotifierStack,
  insertForeignThongBao,
  readEmails,
  readThongBao,
  runConfirmPaid,
  worldState,
} from '../testing/notification-world.js';
import { failAfterStatement } from '../testing/statement-recorder.js';
import {
  db,
  fx,
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
import { BookingNotifier } from './booking-notifier.js';

// Task B15 — `BookingNotifier` THẬT trên MySQL 8.4 THẬT (PLAN booking 5.12, 7.14, 7.43; TRACKING 3.37 B15-G, B15-L): NTF-01 (bốn sự kiện, đúng tài khoản ĐẶT, cùng giao dịch; TB-01, DL-01), NTF-02 (hoàn tác trọn ở cả bốn
// lõi: DL-27, HL-16, CG-02), NTF-03 và NTF-04 (UNIQUE trùng là "đã có", chỉ nuốt đúng khoá), NTF-05 (hết hạn giữ chỗ không thông báo; TB-06), NTF-06 (khoá no-show không lặp; TB-03), NTF-07 (không đụng dòng của nguồn khác).
// Chữ của `noi_dung` (NTF-08, NTF-09) ở notification-text.spec.ts; ca đồng thời (NTF-10) ở booking-notifier.concurrency.int-spec.ts. Mọi lời gọi qua `withBookingTransaction` thật (READ COMMITTED). Cổng danh sách chờ, hoàn tiền
// và tiền đã thu là bản `Fake`; thông báo là BẢN THẬT. Đồng hồ ứng dụng giả T0 = 08:00 ngày 02/11/2026 nên `thoi_diem_tao` mặc định là `T0_TEXT`.
useStatusWorldHooks();
const { CONFIRMED, CANCELLED, NO_SHOW, NO_SHOW_LOCK } =
  BOOKING_NOTIFICATION_EVENTS;
const LY_DO_KHAM = 'Đau ngực, khó thở (lý do khám riêng tư)';
const FOUR = [CONFIRMED, CANCELLED, NO_SHOW, NO_SHOW_LOCK];

// Chữ biến thể huỷ theo vai trò (Q30): Lễ tân và Quản trị viên CÙNG biến thể "phòng khám điều chỉnh"
const VARIANT: Record<CancelRole, string> = {
  BenhNhan: 'đã được hủy theo yêu cầu của bạn.',
  LeTan: 'đã được phòng khám điều chỉnh và hủy.',
  QuanTriVien: 'đã được phòng khám điều chỉnh và hủy.',
  HeThong: 'đã bị hủy do bác sĩ nghỉ phép.',
};

const idOf = async (maLichHen: string): Promise<string> => {
  const rows: { id: string }[] = await db.query(
    'SELECT CAST(lich_hen_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?',
    [maLichHen],
  );
  return rows[0]!.id;
};

/** Mỗi `thong_bao` có đúng MỘT dòng `email_thong_bao` `ChoGui` (chưa ai gửi). */
async function expectOneWaitingEmailEach(): Promise<void> {
  const thongBao = await readThongBao(db);
  expect(await readEmails(db)).toEqual(
    thongBao.map((row) => ({
      thongBaoId: row.thongBaoId,
      trangThai: 'ChoGui',
      soLanThu: 0,
      lanThuCuoiLuc: null,
      daGuiLuc: null,
      loiCuoi: null,
    })),
  );
}

describe('NTF-01 bốn sự kiện ghi đúng tài khoản ĐẶT, đúng loại, kèm dòng email ChoGui (TB-01; DL-01 đủ Pass)', () => {
  it('LichHenDaXacNhan ở đường TẠO cọc 0đ cho hồ sơ người thân: một dòng cho Bệnh nhân đặt (người thân không có tài khoản), chữ có mã lịch và KHÔNG có lý do khám', async () => {
    const w = await world();
    const created = await createRealCreateService(db).create(w.patientId, {
      khungGioId: w.slotId(0),
      hoSoNguoiThanId: w.relativeId,
      lyDoKham: LY_DO_KHAM,
    });
    expect(created.trangThai).toBe('DaXacNhan');
    const rows = await readThongBao(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taiKhoanId: w.patientId,
      loai: CONFIRMED,
      lichHenId: await idOf(created.maLichHen),
      thoiDiemTao: T0_TEXT,
    });
    expect(Number(rows[0]!.trangThaiDoc)).toBe(0);
    expect(rows[0]!.noiDung).toContain(created.maLichHen);
    expect(rows[0]!.noiDung).not.toContain(LY_DO_KHAM);
    await expectOneWaitingEmailEach();
  });

  it('LichHenDaXacNhan ở `confirmPaid` (đường của payment): một dòng, đúng lịch, đúng tài khoản đặt', async () => {
    const w = await world();
    const { transition } = createRealNotifierStack(db);
    const lich = await w.booked('ChoThanhToan', 1, {
      coc: DEPOSIT,
      hoSoNguoiThanId: w.relativeId,
    });
    expect(await runConfirmPaid(db, transition, lich.lichHenId)).toEqual({
      kind: 'Confirmed',
    });
    const rows = await readThongBao(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taiKhoanId: w.patientId,
      loai: CONFIRMED,
      lichHenId: lich.lichHenId,
    });
    await expectOneWaitingEmailEach();
  });

  it.each<CancelRole>(['BenhNhan', 'LeTan', 'QuanTriVien', 'HeThong'])(
    'LichHenDaHuy do %s huỷ: ghi cho Bệnh nhân ĐẶT (không phải người huỷ), chữ đúng biến thể, chưa thu tiền thì nói không có hoàn tiền',
    async (role) => {
      const w = await world();
      const { cancellation } = createRealNotifierStack(db);
      const lich = await w.booked('DaXacNhan', 0, {
        hoSoNguoiThanId: w.relativeId,
      });
      const outcome = await cancellation.cancel(
        cancelInput(w, role, lich.maLichHen),
      );
      expect(outcome).toStrictEqual(cancelledOutcome(lich.maLichHen, null));
      const rows = await readThongBao(db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        taiKhoanId: w.patientId,
        loai: CANCELLED,
        lichHenId: lich.lichHenId,
      });
      expect(rows[0]!.noiDung).toBe(
        `Lịch hẹn ${lich.maLichHen} ${VARIANT[role]} Lịch hẹn này chưa phát sinh khoản thanh toán nên không có hoàn tiền.`,
      );
      await expectOneWaitingEmailEach();
    },
  );

  it('LichHenDaHuy đã thu cọc, huỷ trước giờ hẹn 3 giờ: câu "hoàn dự kiến" mang đúng số `cancel` TÍNH RA (50% của 100.000)', async () => {
    const w = await world();
    const stack = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    stack.ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    atRemaining(3 * HOUR_MS);
    const outcome = await stack.cancellation.cancel(
      cancelInput(w, 'BenhNhan', lich.maLichHen),
    );
    expect(outcome).toStrictEqual(
      cancelledOutcome(lich.maLichHen, HALF_REFUND),
    );
    expect((await readThongBao(db))[0]!.noiDung).toBe(
      `Lịch hẹn ${lich.maLichHen} đã được hủy theo yêu cầu của bạn. Hoàn dự kiến 50.000 VNĐ (50% tiền cọc).`,
    );
  });

  it('LichHenVangMat rồi KhoaDatLichNoShow ở `markNoShow` đạt ngưỡng: hai dòng cho Bệnh nhân ĐẶT, số lần và ngưỡng đúng, hai dòng email', async () => {
    const w = await world();
    const { transition } = createRealNotifierStack(db);
    await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
    const lich = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    expect(
      await runNoShow(db, transition, noShowInput(w, lich.lichHenId, 'LeTan')),
    ).toEqual({ kind: 'NoShowed', soLanNoShow: 3, khoaDatLich: true });
    const rows = await readThongBao(db);
    expect(rows.map((row) => row.loai)).toEqual([NO_SHOW, NO_SHOW_LOCK]);
    for (const row of rows)
      expect(row).toMatchObject({
        taiKhoanId: w.patientId,
        lichHenId: lich.lichHenId,
      });
    expect(rows[0]!.noiDung).toBe(
      `Bạn đã vắng mặt tại lịch hẹn ${lich.maLichHen} (lần thứ 3). Từ 3 lần vắng mặt, tài khoản sẽ bị hạn chế đặt lịch online.`,
    );
    expect(rows[1]!.noiDung).toBe(
      'Tài khoản của bạn đã bị hạn chế đặt lịch online do vắng mặt 3 lần (ngưỡng 3 lần). Đây không phải khóa đăng nhập tài khoản.',
    );
    await expectOneWaitingEmailEach();
  });

  it('không ghi cho Bệnh nhân khác, Lễ tân hay Quản trị viên dù họ là người thực hiện', async () => {
    const w = await world();
    const { cancellation } = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    await cancellation.cancel(cancelInput(w, 'LeTan', lich.maLichHen));
    const others = (await readThongBao(db)).filter(
      (row) => row.taiKhoanId !== w.patientId,
    );
    expect(others).toEqual([]);
  });
});

// Mỗi lõi (tạo cọc 0đ, xác nhận thanh toán, huỷ, Vắng mặt kèm khoá) cho chạy thật tới hết câu ghi thông báo rồi mới ném
const CORES: [
  string,
  (
    w: StatusWorld,
    stack: ReturnType<typeof createRealNotifierStack>,
  ) => Promise<() => Promise<unknown>>,
][] = [
  [
    'tạo lịch cọc 0đ (B8)',
    (w) =>
      Promise.resolve(() =>
        createRealCreateService(db).create(w.patientId, {
          khungGioId: w.slotId(0),
          hoSoNguoiThanId: w.relativeId,
          lyDoKham: null,
        }),
      ),
  ],
  [
    'confirmPaid (B11)',
    async (w, stack) => {
      const lich = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
      return () => runConfirmPaid(db, stack.transition, lich.lichHenId);
    },
  ],
  [
    'cancel (B10)',
    async (w, stack) => {
      const lich = await w.booked('DaXacNhan', 0);
      return () =>
        stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
    },
  ],
  [
    'markNoShow kèm khoá (B12)',
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
  ],
];
const FAIL_POINTS: [string, RegExp][] = [
  ['INSERT thong_bao', /^INSERT INTO thong_bao\b/],
  ['INSERT email_thong_bao', /^INSERT INTO email_thong_bao\b/],
];

describe('NTF-02 lỗi ghi thông báo ⇒ hoàn tác TRỌN lần đổi trạng thái ở cả bốn lõi (DL-27, HL-16, CG-02)', () => {
  it.each(
    CORES.flatMap(([core, prepare]) =>
      FAIL_POINTS.map(([point, pattern]) => ({
        core,
        prepare,
        point,
        pattern,
      })),
    ),
  )(
    '$core: lỗi SAU câu $point đã chạy thật ⇒ lịch, khung giờ, bộ đếm, thong_bao và email_thong_bao về đúng như trước',
    async ({ prepare, pattern }) => {
      const w = await world();
      const stack = createRealNotifierStack(db);
      const run = await prepare(w, stack);
      const before = await worldState(db);
      const boom = new Error('ghi thông báo hỏng');
      const matched = failAfterStatement(db, pattern, boom);

      await expect(run()).rejects.toBe(boom);

      // câu đã CHẠY THẬT (kể cả dòng thong_bao đã ghi trong giao dịch) rồi mới ném: hoàn tác phải xoá nó cùng giao dịch
      expect(matched.length).toBeGreaterThanOrEqual(1);
      expect(await worldState(db)).toEqual(before);
      expect(await readThongBao(db)).toEqual([]);
      expect(await readEmails(db)).toEqual([]);
    },
  );
});

describe('NTF-03 UNIQUE (lịch, tài khoản, loại) trùng là "đã có": không 500, không hoàn tác lõi, không email thứ hai (B12-G)', () => {
  it('override VangMat → DaXacNhan → VangMat cùng một lịch: lần Vắng mặt thứ hai THÀNH CÔNG (bộ đếm 2), vẫn đúng 1 dòng LichHenVangMat và 1 dòng email', async () => {
    const w = await world();
    const { transition } = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const input = () => noShowInput(w, lich.lichHenId, 'LeTan');
    expect(await runNoShow(db, transition, input())).toMatchObject({
      kind: 'NoShowed',
      soLanNoShow: 1,
    });
    // Quản trị viên khôi phục lịch Vắng mặt về DaXacNhan (Q24; khung giờ vẫn DaDat), rồi lịch lại Vắng mặt
    await db.query(
      "UPDATE lich_hen SET trang_thai = 'DaXacNhan' WHERE lich_hen_id = ?",
      [lich.lichHenId],
    );
    expect(await runNoShow(db, transition, input())).toMatchObject({
      kind: 'NoShowed',
      soLanNoShow: 2,
    });
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 2,
      khoa: false,
    });
    expect(await readThongBao(db, NO_SHOW)).toHaveLength(1);
    expect(await readEmails(db)).toHaveLength(1);
    const [{ trangThai }] = await db.query<{ trangThai: string }[]>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lich.lichHenId],
    );
    expect(trangThai).toBe('VangMat');
  });

  it('trong MỘT giao dịch: sự kiện lần hai bị bỏ qua nhưng giao dịch VẪN DÙNG TIẾP được (MySQL chỉ hoàn tác câu 1062) và sự kiện khác loại vẫn ghi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const notifier = new BookingNotifier();
    const event = {
      lichHenId: lich.lichHenId,
      taiKhoanId: w.patientId,
    };
    await withBookingTransaction(
      db,
      async (em) => {
        await notifier.notify(em, { ...event, loaiSuKien: CONFIRMED });
        await notifier.notify(em, { ...event, loaiSuKien: CONFIRMED });
        await notifier.notify(em, {
          ...event,
          loaiSuKien: CANCELLED,
          huy: { reason: 'LeTanHuy', hoanCoc: null },
        });
      },
      { label: 'ntf-03-duplicate' },
    );
    const rows = await readThongBao(db);
    expect(rows.map((row) => row.loai)).toEqual([CONFIRMED, CANCELLED]);
    await expectOneWaitingEmailEach();
  });
});

describe('NTF-04 chỉ nuốt 1062 của ĐÚNG chỉ mục UNIQUE: mọi lỗi khác nổi lên và hoàn tác', () => {
  it('tài khoản nhận không tồn tại (1452 khoá ngoại): notify ném đúng lỗi đó, không dòng nào được ghi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const error: unknown = await withBookingTransaction(
      db,
      (em) =>
        new BookingNotifier().notify(em, {
          loaiSuKien: CONFIRMED,
          lichHenId: lich.lichHenId,
          taiKhoanId: '987654321',
        }),
      { label: 'ntf-04-fk' },
    ).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isForeignKeyError(error)).toBe(true);
    expect(await readThongBao(db)).toEqual([]);
    expect(await readEmails(db)).toEqual([]);
  });

  it('lịch không tồn tại: ném lỗi TRƯỚC mọi INSERT (dữ liệu lệch ⇒ lõi hoàn tác)', async () => {
    const w = await world();
    await expect(
      withBookingTransaction(
        db,
        (em) =>
          new BookingNotifier().notify(em, {
            loaiSuKien: CONFIRMED,
            lichHenId: '987654321',
            taiKhoanId: w.patientId,
          }),
        { label: 'ntf-04-missing' },
      ),
    ).rejects.toThrow(/không có khi ghi thông báo/);
    expect(await readThongBao(db)).toEqual([]);
  });
});

describe('NTF-05 hết hạn giữ chỗ KHÔNG thông báo (Q6; TB-06), kiểm với thông báo THẬT', () => {
  it('job hết hạn huỷ lịch ChoThanhToan quá hạn: lịch DaHuy nhưng 0 lần gọi notify, 0 dòng thong_bao, 0 dòng email_thong_bao', async () => {
    const w = await world();
    await w.pending(0);
    // bản Fake chuyển lời gọi sang bản THẬT: nếu `expire` nào đó gọi notify thì dòng sẽ được ghi và `count` > 0
    const spy = new FakeAppointmentNotifier();
    const real = new BookingNotifier();
    spy.notifyCall.onCall((em, event) => real.notify(em, event));
    const { job } = createExpiryStack(db, undefined, spy);
    const summary = await job.run(FLOW_NOW);
    expect(summary).toMatchObject({ expired: 1, failed: 0 });
    expect(spy.notifyCall.count).toBe(0);
    expect(await readThongBao(db)).toEqual([]);
    expect(await readEmails(db)).toEqual([]);
  });

  // Đường LƯỜI (DL-05, PLAN 5.5): người khác đặt đúng khung giờ mà lịch cũ đang giữ nhưng đã quá hạn, job chưa quét. `create` huỷ lịch cũ (`cancelLapsedHold`) TRONG giao dịch của lần tạo.
  // Lịch cũ KHÔNG có thông báo; thông báo duy nhất (nếu có) là của lịch MỚI khi cọc 0đ.
  it.each([
    ['cọc > 0 (lịch mới ChoThanhToan, chưa thông báo)', '50000.00', 0],
    ['cọc 0đ (lịch mới DaXacNhan, đúng một thông báo của lịch MỚI)', '0.00', 1],
  ])(
    'đường lười, %s: lịch cũ DaHuy mà KHÔNG có dòng thong_bao hay email_thong_bao nào của lịch cũ hay của chủ lịch cũ',
    async (_name, tienCoc, expectedNotifications) => {
      const w = await world();
      if (tienCoc !== '0.00')
        await fx.depositService(w.doctor.profile.dichVuKhamId, tienCoc);
      const old = await fx.appointmentIn('ChoThanhToan', {
        doctor: w.doctor.profile,
        khungGioId: w.slotId(0),
        patientId: w.secondPatientId,
        hanThanhToan: new Date(BOOKING_T0.getTime() - 60_000),
      });

      const created = await createRealCreateService(db).create(w.patientId, {
        khungGioId: w.slotId(0),
        hoSoNguoiThanId: null,
        lyDoKham: null,
      });

      const oldRows: { trangThai: string }[] = await db.query(
        'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
        [old.lichHenId],
      );
      expect(oldRows[0]?.trangThai).toBe('DaHuy');
      const rows = await readThongBao(db);
      expect(
        rows.filter(
          (row) =>
            row.lichHenId === old.lichHenId ||
            row.taiKhoanId === w.secondPatientId,
        ),
      ).toEqual([]);
      expect(rows).toHaveLength(expectedNotifications);
      expect(await readEmails(db)).toHaveLength(expectedNotifications);
      if (expectedNotifications === 1)
        expect(rows[0]).toMatchObject({
          loai: CONFIRMED,
          taiKhoanId: w.patientId,
          lichHenId: await idOf(created.maLichHen),
        });
    },
  );
});

describe('NTF-06 khoá no-show KHÔNG lặp khi cờ đã bật (A4, 10b; TB-03)', () => {
  it('ngưỡng 3: lần thứ ba đạt ngưỡng ghi KhoaDatLichNoShow (gắn lịch gây khoá); lần thứ tư (cờ đã bật) chỉ ghi LichHenVangMat', async () => {
    const w = await world();
    const { transition } = createRealNotifierStack(db);
    await setNoShow(db, w.patientId, { soLan: 1, khoa: false });
    const [first, second, third] = [
      await w.booked('DaXacNhan', 0),
      await w.booked('DaXacNhan', 1),
      await w.booked('DaXacNhan', 2),
    ];
    const outcomes = [];
    for (const lich of [first, second, third])
      outcomes.push(
        await runNoShow(
          db,
          transition,
          noShowInput(w, lich.lichHenId, 'LeTan'),
        ),
      );
    expect(outcomes).toEqual([
      { kind: 'NoShowed', soLanNoShow: 2, khoaDatLich: false },
      { kind: 'NoShowed', soLanNoShow: 3, khoaDatLich: true },
      { kind: 'NoShowed', soLanNoShow: 4, khoaDatLich: false },
    ]);
    const locks = await readThongBao(db, NO_SHOW_LOCK);
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({
      lichHenId: second.lichHenId,
      taiKhoanId: w.patientId,
    });
    expect(await readThongBao(db, NO_SHOW)).toHaveLength(3);
    expect(await readEmails(db)).toHaveLength(4);
  });
});

describe('NTF-07 chỉ ghi bốn loại của booking; không đụng dòng của nguồn khác', () => {
  it('dòng thong_bao sẵn có của nghỉ phép (không `lich_hen_id`) nguyên vẹn sau một lần huỷ; chỉ thêm đúng một dòng', async () => {
    const w = await world();
    await insertForeignThongBao(db, w.patientId);
    const before = await readThongBao(db);
    const { cancellation } = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    await cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
    const after = await readThongBao(db);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
    // dòng của nguồn khác KHÔNG có dòng hộp thư đi (B15 chỉ xếp email cho thông báo của booking)
    expect(await readEmails(db)).toHaveLength(1);
  });

  it('cả bốn sự kiện trên một thế giới: tập `loai_su_kien` là ĐÚNG bốn hằng, không loại nào khác', async () => {
    const w = await world();
    const stack = createRealNotifierStack(db);
    const toConfirm = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
    await runConfirmPaid(db, stack.transition, toConfirm.lichHenId);
    const toCancel = await w.booked('DaXacNhan', 1);
    await stack.cancellation.cancel(
      cancelInput(w, 'BenhNhan', toCancel.maLichHen),
    );
    await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
    const toNoShow = await w.booked('DaXacNhan', 2);
    await runNoShow(
      db,
      stack.transition,
      noShowInput(w, toNoShow.lichHenId, 'LeTan'),
    );
    expect(new Set((await readThongBao(db)).map((row) => row.loai))).toEqual(
      new Set(FOUR),
    );
  });
});

describe('NTF-12 dòng B15 ghi đọc lại được bằng entity của admin (hợp đồng với Trung tâm thông báo của Trung)', () => {
  it('`Repository<ThongBao>` và `Repository<EmailThongBao>`: id là chuỗi, `lichHenId` đúng lịch, trạng thái đọc false, email ChoGui và 0 lần thử', async () => {
    const w = await world();
    const { cancellation } = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    await cancellation.cancel(cancelInput(w, 'LeTan', lich.maLichHen));

    const thongBao = await db.getRepository(ThongBao).findOneByOrFail({
      lichHenId: lich.lichHenId,
    });
    expect(typeof thongBao.thongBaoId).toBe('string');
    expect(thongBao).toMatchObject({
      taiKhoanId: w.patientId,
      loaiSuKien: CANCELLED,
      lichHenId: lich.lichHenId,
      yeuCauThayDoiChiNhanhId: null,
    });
    expect(thongBao.trangThaiDoc).toBe(false);
    expect(thongBao.noiDung.length).toBeLessThanOrEqual(500);
    const email = await db.getRepository(EmailThongBao).findOneByOrFail({
      thongBaoId: thongBao.thongBaoId,
    });
    expect(email).toMatchObject({
      trangThai: 'ChoGui',
      soLanThu: 0,
      daGuiLuc: null,
      lanThuCuoiLuc: null,
      loiCuoi: null,
    });
  });
});

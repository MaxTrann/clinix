import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { deadlockError } from '../testing/create-appointment-world.js';
import {
  assertBookingInvariants,
  checkMilestonesMatchState,
} from '../testing/invariants.js';
import { createTransitionStack } from '../testing/payment-doctor-fakes.js';
import { failAfterStatement } from '../testing/statement-recorder.js';
import {
  db,
  fx,
  racePair,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import {
  checkInInput,
  createStatusStack,
  IN_WINDOW,
  noShowInput,
  runCheckIn,
  runNoShow,
  WINDOW_END,
} from '../testing/status-world.js';

// Booking B19 (issue #551; TRACKING 3.46.3) — mốc thời gian từng bước TRÊN MySQL 8.4 THẬT: MOC-07 (confirmPaid), MOC-08 (checkIn), MOC-09 (complete), MOC-10 (Vắng mặt), MOC-11 (khôi phục), MOC-12 (huỷ giữ mốc),
// MOC-13 (lịch cũ không điền giả), MOC-14 (từ chối không đổi mốc), MOC-15 (lỗi giữa chừng hoàn tác cả mốc, thử lại ghi đúng một lần), MOC-16 (cạnh tranh), MOC-17 (bất biến INV-06). Phần hàm (không DB): `set-status.query`,
// `status-queries.spec.ts`, `confirm-paid.spec.ts`, `complete-appointment.spec.ts`, `lich-hen-insert.query.spec.ts`. Mọi lời gọi qua `withBookingTransaction` thật; cổng danh sách chờ và hoàn tiền là bản `Fake`.
// Giờ viết theo giờ Việt Nam (DB và driver cùng +07:00); `now` truyền tường minh nên không phụ thuộc đồng hồ giả.
useStatusWorldHooks();

interface Moc {
  trangThai: string;
  xn: string | null;
  td: string | null;
  ht: string | null;
}

const text = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s')`;
const mocOf = async (lichHenId: string): Promise<Moc> =>
  (
    await db.query<Moc[]>(
      `SELECT trang_thai AS trangThai, ${text('thoi_diem_xac_nhan')} AS xn, ${text('thoi_diem_tiep_don')} AS td, ${text('thoi_diem_hoan_thanh')} AS ht
         FROM lich_hen WHERE lich_hen_id = ?`,
      [lichHenId],
    )
  )[0] as Moc;
const preset = (
  lichHenId: string,
  xn: string | null,
  td: string | null,
  ht: string | null = null,
) =>
  db.query(
    'UPDATE lich_hen SET thoi_diem_xac_nhan = ?, thoi_diem_tiep_don = ?, thoi_diem_hoan_thanh = ? WHERE lich_hen_id = ?',
    [xn, td, ht, lichHenId],
  );

// Mốc cho trước (lịch đã đi qua các bước) và mốc của lượt đang thử
// Giờ Việt Nam (+07:00) dạng `YYYY-MM-DD HH:mm:ss` của một thời điểm, để so với cột DATETIME đọc bằng DATE_FORMAT
const vnText = (instant: Date): string =>
  new Date(instant.getTime() + 7 * 3_600_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
const XN = '2026-11-02 08:00:00';
const TD = '2026-11-10 07:50:00';
const NOW = new Date('2026-11-10T08:00:30+07:00');
const NOW_TEXT = '2026-11-10 08:00:30';
const IN_WINDOW_TEXT = '2026-11-10 08:00:00';

async function given() {
  const w = await world();
  const status = createStatusStack(db);
  const stack = createTransitionStack(db, w.patientId);
  const ownerId = w.doctor.profile.taiKhoanId;
  const adminCheckIn = (lichHenId: string, now: Date = NOW) =>
    withBookingTransaction(
      db,
      (em) =>
        status.transition.checkIn(em, {
          lichHenId,
          now,
          config: null,
          actor: 'QuanTriVien',
          canAct: () => true,
        }),
      { label: 'moc-admin-check-in' },
    );
  const restore = (lichHenId: string) =>
    withBookingTransaction(
      db,
      (em) =>
        status.transition.restoreConfirmed(em, {
          lichHenId,
          actor: 'QuanTriVien',
          canAct: () => true,
        }),
      { label: 'moc-restore' },
    );
  const cancel = (lich: LichHen, actor: 'BenhNhan' | 'QuanTriVien') =>
    withBookingTransaction(
      db,
      (em) =>
        status.transition.cancel(em, {
          lichHenId: lich.lichHenId,
          khungGioId: lich.khungGioId,
          actor,
          canAct: () => true,
          lyDo: 'Huỷ để thử mốc',
          now: NOW,
        }),
      { label: 'moc-cancel' },
    );
  return {
    w,
    status,
    stack,
    ownerId,
    adminCheckIn,
    restore,
    cancel,
  };
}

describe('MOC-07 confirmPaid ghi thoi_diem_xac_nhan = now của người gọi, trong cùng giao dịch', () => {
  it('lịch ChoThanhToan: Confirmed ⇒ thoi_diem_xac_nhan = now TRUYỀN VÀO (không phải giờ tạo hay giờ DB); hai mốc sau NULL; gọi lại (AlreadyConfirmed) không đổi mốc', async () => {
    const { w, stack } = await given();
    const lich = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'ChoThanhToan',
      xn: null,
      td: null,
      ht: null,
    });

    await expect(stack.pay(lich.lichHenId, { now: NOW })).resolves.toEqual({
      kind: 'Confirmed',
    });
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'DaXacNhan',
      xn: NOW_TEXT,
      td: null,
      ht: null,
    });

    const later = new Date(NOW.getTime() + 3_600_000);
    await expect(stack.pay(lich.lichHenId, { now: later })).resolves.toEqual({
      kind: 'AlreadyConfirmed',
    });
    expect((await mocOf(lich.lichHenId)).xn).toBe(NOW_TEXT);
    await assertBookingInvariants(db);
  });

  it('InvalidState (lịch đã DaTiepDon hay đã huỷ): không đổi mốc đã có', async () => {
    const { w, stack } = await given();
    const tiepDon = await w.booked('DaTiepDon', 0);
    await preset(tiepDon.lichHenId, XN, TD);
    const huy = await w.booked('DaHuy', 1);
    await expect(
      stack.pay(tiepDon.lichHenId, { now: NOW }),
    ).resolves.toMatchObject({ kind: 'InvalidState' });
    await expect(stack.pay(huy.lichHenId, { now: NOW })).resolves.toMatchObject(
      { kind: expect.stringMatching(/InvalidState|HetHanGiuCho/) },
    );
    expect(await mocOf(tiepDon.lichHenId)).toEqual({
      trangThai: 'DaTiepDon',
      xn: XN,
      td: TD,
      ht: null,
    });
    expect(await mocOf(huy.lichHenId)).toMatchObject({ xn: null, td: null });
  });
});

describe('MOC-08 checkIn ghi thoi_diem_tiep_don = now cho từng người gọi, giữ thoi_diem_xac_nhan', () => {
  it.each(['LeTan', 'ThanhToan'] as const)(
    'actor %s: DaXacNhan ⇒ DaTiepDon, tiep_don = now (giờ hẹn %s), xac_nhan giữ nguyên, hoan_thanh NULL',
    async (role) => {
      const { w, status } = await given();
      const lich = await w.booked('DaXacNhan', 0);
      await preset(lich.lichHenId, XN, null);
      await expect(
        runCheckIn(
          db,
          status.transition,
          checkInInput(w, lich.lichHenId, role),
        ),
      ).resolves.toEqual({ kind: 'CheckedIn' });
      expect(await mocOf(lich.lichHenId)).toEqual({
        trangThai: 'DaTiepDon',
        xn: XN,
        td: IN_WINDOW_TEXT,
        ht: null,
      });
      await assertBookingInvariants(db);
    },
  );

  it.each(['DaXacNhan', 'VangMat'] as const)(
    'Quản trị viên từ %s: tiep_don = now của lượt; xac_nhan giữ nguyên',
    async (from) => {
      const { w, adminCheckIn } = await given();
      const lich = await w.booked(from, 0);
      await preset(lich.lichHenId, XN, null);
      await expect(adminCheckIn(lich.lichHenId)).resolves.toEqual({
        kind: 'CheckedIn',
      });
      expect(await mocOf(lich.lichHenId)).toEqual({
        trangThai: 'DaTiepDon',
        xn: XN,
        td: NOW_TEXT,
        ht: null,
      });
      await assertBookingInvariants(db);
    },
  );
});

describe('MOC-09 complete ghi thoi_diem_hoan_thanh = now, giữ hai mốc trước', () => {
  it('Bác sĩ phụ trách: DaTiepDon ⇒ HoanThanh, hoan_thanh = now truyền vào; xac_nhan và tiep_don nguyên', async () => {
    const { w, stack, ownerId } = await given();
    const lich = await w.booked('DaTiepDon', 0);
    await preset(lich.lichHenId, XN, TD);
    await expect(
      stack.exam(lich.lichHenId, ownerId, undefined, NOW),
    ).resolves.toEqual({ kind: 'Completed' });
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'HoanThanh',
      xn: XN,
      td: TD,
      ht: NOW_TEXT,
    });
    await assertBookingInvariants(db);
  });
});

describe('MOC-09 complete chỉ ghi mốc vào ĐÚNG hàng của lịch được hoàn thành', () => {
  it('hai lịch DaTiepDon cùng bác sĩ: hoàn thành lịch thứ nhất ⇒ chỉ nó có hoan_thanh; lịch thứ hai vẫn DaTiepDon, hoan_thanh NULL', async () => {
    const { w, stack, ownerId } = await given();
    const first = await w.booked('DaTiepDon', 0);
    const second = await w.booked('DaTiepDon', 1);
    await preset(first.lichHenId, XN, TD);
    await preset(second.lichHenId, XN, TD);
    await expect(
      stack.exam(first.lichHenId, ownerId, undefined, NOW),
    ).resolves.toEqual({ kind: 'Completed' });
    expect(await mocOf(first.lichHenId)).toEqual({
      trangThai: 'HoanThanh',
      xn: XN,
      td: TD,
      ht: NOW_TEXT,
    });
    expect(await mocOf(second.lichHenId)).toEqual({
      trangThai: 'DaTiepDon',
      xn: XN,
      td: TD,
      ht: null,
    });
  });
});

describe('MOC-10 Vắng mặt: không thêm mốc; chỉ Quản trị viên từ DaTiepDon XOÁ thoi_diem_tiep_don', () => {
  it('Lễ tân đánh Vắng mặt lịch DaXacNhan: xac_nhan giữ nguyên, tiep_don và hoan_thanh vẫn NULL', async () => {
    const { w, status } = await given();
    const lich = await w.booked('DaXacNhan', 0);
    await preset(lich.lichHenId, XN, null);
    await expect(
      runNoShow(db, status.transition, noShowInput(w, lich.lichHenId, 'LeTan')),
    ).resolves.toMatchObject({ kind: 'NoShowed' });
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'VangMat',
      xn: XN,
      td: null,
      ht: null,
    });
  });

  it('Quản trị viên chuyển DaTiepDon sang VangMat: tiep_don bị XOÁ, xac_nhan giữ nguyên', async () => {
    const { w, status } = await given();
    const lich = await w.booked('DaTiepDon', 0);
    await preset(lich.lichHenId, XN, TD);
    await expect(
      runNoShow(
        db,
        status.transition,
        noShowInput(w, lich.lichHenId, 'QuanTriVien'),
      ),
    ).resolves.toMatchObject({ kind: 'NoShowed' });
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'VangMat',
      xn: XN,
      td: null,
      ht: null,
    });
    await assertBookingInvariants(db);
  });
});

describe('MOC-11 restoreConfirmed: về DaXacNhan XOÁ thoi_diem_tiep_don, giữ thoi_diem_xac_nhan', () => {
  it('từ DaTiepDon: tiep_don bị xoá; từ VangMat: tiep_don vẫn NULL; xac_nhan giữ ở cả hai', async () => {
    const { w, restore } = await given();
    const tiepDon = await w.booked('DaTiepDon', 0);
    await preset(tiepDon.lichHenId, XN, TD);
    const vangMat = await w.booked('VangMat', 1);
    await preset(vangMat.lichHenId, XN, null);

    await expect(restore(tiepDon.lichHenId)).resolves.toEqual({
      kind: 'Restored',
    });
    await expect(restore(vangMat.lichHenId)).resolves.toEqual({
      kind: 'Restored',
    });
    for (const lich of [tiepDon, vangMat])
      expect(await mocOf(lich.lichHenId)).toEqual({
        trangThai: 'DaXacNhan',
        xn: XN,
        td: null,
        ht: null,
      });
    await assertBookingInvariants(db);
  });
});

describe('MOC-12 huỷ GIỮ NGUYÊN mọi mốc đã có', () => {
  it('Quản trị viên huỷ lịch DaTiepDon: tiep_don và xac_nhan còn nguyên; Bệnh nhân huỷ lịch DaXacNhan: xac_nhan còn nguyên', async () => {
    const { w, cancel } = await given();
    const tiepDon = await w.booked('DaTiepDon', 0);
    await preset(tiepDon.lichHenId, XN, TD);
    const xacNhan = await w.booked('DaXacNhan', 1);
    await preset(xacNhan.lichHenId, XN, null);

    await expect(cancel(tiepDon, 'QuanTriVien')).resolves.toMatchObject({
      kind: 'Cancelled',
    });
    await expect(cancel(xacNhan, 'BenhNhan')).resolves.toMatchObject({
      kind: 'Cancelled',
    });
    expect(await mocOf(tiepDon.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      xn: XN,
      td: TD,
      ht: null,
    });
    expect(await mocOf(xacNhan.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      xn: XN,
      td: null,
      ht: null,
    });
    await assertBookingInvariants(db);
  });
});

describe('MOC-13 lịch cũ (ba mốc NULL): chỉ ghi mốc của bước vừa làm, KHÔNG điền giả mốc đã qua', () => {
  it('checkIn trên lịch cũ: tiep_don có, xac_nhan vẫn NULL; khôi phục: tiep_don xoá, xac_nhan vẫn NULL; complete trên lịch DaTiepDon cũ: chỉ hoan_thanh có', async () => {
    const { w, status, stack, ownerId, restore } = await given();
    const cu = await w.booked('DaXacNhan', 0);
    await runCheckIn(
      db,
      status.transition,
      checkInInput(w, cu.lichHenId, 'LeTan'),
    );
    expect(await mocOf(cu.lichHenId)).toEqual({
      trangThai: 'DaTiepDon',
      xn: null,
      td: IN_WINDOW_TEXT,
      ht: null,
    });
    await restore(cu.lichHenId);
    expect(await mocOf(cu.lichHenId)).toEqual({
      trangThai: 'DaXacNhan',
      xn: null,
      td: null,
      ht: null,
    });

    const khac = await w.booked('DaTiepDon', 1);
    await stack.exam(khac.lichHenId, ownerId, undefined, NOW);
    expect(await mocOf(khac.lichHenId)).toEqual({
      trangThai: 'HoanThanh',
      xn: null,
      td: null,
      ht: NOW_TEXT,
    });
  });
});

describe('MOC-14 mọi từ chối có kiểu KHÔNG đổi mốc', () => {
  it('checkIn ngoài cửa sổ và trên lịch đã DaTiepDon, complete của bác sĩ khác, khôi phục lịch DaXacNhan: mốc nguyên từng byte', async () => {
    const { w, status, stack, restore } = await given();
    const xacNhan = await w.booked('DaXacNhan', 0);
    await preset(xacNhan.lichHenId, XN, null);
    const tiepDon = await w.booked('DaTiepDon', 1);
    await preset(tiepDon.lichHenId, XN, TD);
    const stranger = (await fx.admin.doctor(w.branch)).profile.taiKhoanId;
    const beforeXn = await mocOf(xacNhan.lichHenId);
    const beforeTd = await mocOf(tiepDon.lichHenId);

    const late = new Date(WINDOW_END.getTime() + 60_000);
    await expect(
      runCheckIn(
        db,
        status.transition,
        checkInInput(w, xacNhan.lichHenId, 'LeTan', { now: late }),
      ),
    ).resolves.toMatchObject({ kind: 'OutsideWindow' });
    await expect(
      runCheckIn(
        db,
        status.transition,
        checkInInput(w, tiepDon.lichHenId, 'LeTan'),
      ),
    ).resolves.toMatchObject({ kind: 'InvalidState' });
    await expect(
      stack.exam(tiepDon.lichHenId, stranger, undefined, NOW),
    ).resolves.toEqual({ kind: 'NotAssigned' });
    await expect(restore(xacNhan.lichHenId)).resolves.toMatchObject({
      kind: 'InvalidState',
    });

    expect(await mocOf(xacNhan.lichHenId)).toEqual(beforeXn);
    expect(await mocOf(tiepDon.lichHenId)).toEqual(beforeTd);
  });
});

describe('MOC-15 lỗi giữa chừng hoàn tác CẢ trạng thái lẫn mốc; thử lại do 1213 ghi mốc đúng MỘT lần', () => {
  const UPDATE_STATUS = /^\s*UPDATE lich_hen SET trang_thai/i;

  it('checkIn: lỗi SAU UPDATE lich_hen ⇒ lịch về DaXacNhan, tiep_don NULL', async () => {
    const { w, status } = await given();
    const lich = await w.booked('DaXacNhan', 0);
    await preset(lich.lichHenId, XN, null);
    const error = new Error('lỗi giả sau UPDATE lich_hen (checkIn)');
    const matched = failAfterStatement(db, UPDATE_STATUS, error);
    await expect(
      runCheckIn(
        db,
        status.transition,
        checkInInput(w, lich.lichHenId, 'LeTan'),
      ),
    ).rejects.toBe(error);
    expect(matched).toHaveLength(1);
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'DaXacNhan',
      xn: XN,
      td: null,
      ht: null,
    });
  });

  it('complete: lỗi SAU UPDATE ⇒ lịch về DaTiepDon, hoan_thanh NULL', async () => {
    const { w, stack, ownerId } = await given();
    const lich = await w.booked('DaTiepDon', 0);
    await preset(lich.lichHenId, XN, TD);
    const error = new Error('lỗi giả sau UPDATE lich_hen (complete)');
    failAfterStatement(db, UPDATE_STATUS, error);
    await expect(
      stack.exam(lich.lichHenId, ownerId, undefined, NOW),
    ).rejects.toBe(error);
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'DaTiepDon',
      xn: XN,
      td: TD,
      ht: null,
    });
  });

  it('confirmPaid: lỗi sau khi payment ghi xong ⇒ lịch về ChoThanhToan, xac_nhan NULL', async () => {
    const { w, stack } = await given();
    const lich = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
    const error = new Error('lỗi giả sau confirmPaid');
    await expect(
      stack.pay(lich.lichHenId, { now: NOW, failAfter: error }),
    ).rejects.toBe(error);
    expect(await mocOf(lich.lichHenId)).toEqual({
      trangThai: 'ChoThanhToan',
      xn: null,
      td: null,
      ht: null,
    });
  });

  it('deadlock giả (1213) SAU UPDATE lich_hen: giao dịch hoàn tác rồi chạy lại thân; CheckedIn đúng một lần và tiep_don = now (một mốc)', async () => {
    const { w, status } = await given();
    const lich = await w.booked('DaXacNhan', 0);
    const matched = failAfterStatement(db, UPDATE_STATUS, deadlockError());
    await expect(
      runCheckIn(
        db,
        status.transition,
        checkInInput(w, lich.lichHenId, 'LeTan'),
      ),
    ).resolves.toEqual({ kind: 'CheckedIn' });
    expect(matched).toHaveLength(2);
    expect(await mocOf(lich.lichHenId)).toMatchObject({
      trangThai: 'DaTiepDon',
      td: IN_WINDOW_TEXT,
    });
  });
});

describe('MOC-16 cạnh tranh: mốc luôn khớp trạng thái cuối', () => {
  it('hai checkIn cùng lúc (Lễ tân và thanh toán tiền mặt): đúng một CheckedIn, tiep_don = now của bên thắng; bên thua InvalidState', async () => {
    const { w, status } = await given();
    for (let round = 1; round <= 4; round++) {
      const lich = await w.booked('DaXacNhan', round);
      // Khung giờ số `round` bắt đầu sau khung số 0 đúng `round` × 30 phút: `now` phải đi theo giờ hẹn của CHÍNH khung giờ đó (cửa sổ tiếp đón quanh giờ hẹn), nếu không cả hai bên đều OutsideWindow
      const slotTime = new Date(IN_WINDOW.getTime() + round * 30 * 60_000);
      const leTanNow = slotTime;
      const cashNow = new Date(slotTime.getTime() + 60_000);
      const [first, second] = racePair(
        round,
        () =>
          runCheckIn(
            db,
            status.transition,
            checkInInput(w, lich.lichHenId, 'LeTan', { now: leTanNow }),
          ),
        () =>
          runCheckIn(
            db,
            status.transition,
            checkInInput(w, lich.lichHenId, 'ThanhToan', { now: cashNow }),
          ),
      );
      const results = await Promise.all([first(), second()]);
      expect(results.filter((r) => r.kind === 'CheckedIn')).toHaveLength(1);
      expect(results.filter((r) => r.kind === 'InvalidState')).toHaveLength(1);
      const winner = results[0]?.kind === 'CheckedIn' ? leTanNow : cashNow;
      const after = await mocOf(lich.lichHenId);
      expect(after.trangThai).toBe('DaTiepDon');
      expect(after.td).toBe(vnText(winner));
    }
    await assertBookingInvariants(db);
  });

  it('Quản trị viên khôi phục đua với Bác sĩ hoàn thành lịch DaTiepDon: hoặc HoanThanh (tiep_don và hoan_thanh đủ) hoặc DaXacNhan (tiep_don NULL, hoan_thanh NULL), không bao giờ lẫn', async () => {
    const { w, stack, ownerId, restore } = await given();
    for (let round = 1; round <= 4; round++) {
      const lich = await w.booked('DaTiepDon', round);
      await preset(lich.lichHenId, XN, TD);
      const [first, second] = racePair(
        round,
        () => restore(lich.lichHenId),
        () => stack.exam(lich.lichHenId, ownerId, undefined, NOW),
      );
      await Promise.all([first(), second()]);
      const after = await mocOf(lich.lichHenId);
      if (after.trangThai === 'HoanThanh')
        expect(after).toEqual({
          trangThai: 'HoanThanh',
          xn: XN,
          td: TD,
          ht: NOW_TEXT,
        });
      else
        expect(after).toEqual({
          trangThai: 'DaXacNhan',
          xn: XN,
          td: null,
          ht: null,
        });
    }
    await assertBookingInvariants(db);
  });
});

describe('MOC-17 bất biến INV-06: mốc khớp trạng thái', () => {
  it('dữ liệu hợp lệ (HoanThanh đủ ba mốc, DaTiepDon có hai, DaHuy giữ tiep_don, DaXacNhan chỉ xac_nhan, lịch cũ NULL) ⇒ không vi phạm', async () => {
    const { w } = await given();
    const states = [
      ['HoanThanh', XN, TD, '2026-11-10 08:45:00'],
      ['DaTiepDon', XN, TD, null],
      ['DaHuy', XN, TD, null],
      ['DaXacNhan', XN, null, null],
      ['VangMat', null, null, null],
    ] as const;
    let slot = 0;
    for (const [state, xn, td, ht] of states) {
      const lich = await w.booked(state, slot++);
      await preset(lich.lichHenId, xn, td, ht);
    }
    await expect(checkMilestonesMatchState(db)).resolves.toEqual([]);
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
  });

  it('ca âm: hoan_thanh ở lịch không phải HoanThanh, tiep_don ở lịch DaXacNhan hay VangMat đều bị bắt; assertBookingInvariants ném lỗi nêu INV-06', async () => {
    const { w } = await given();
    const a = await w.booked('DaXacNhan', 0);
    const b = await w.booked('VangMat', 1);
    const c = await w.booked('DaTiepDon', 2);
    await preset(a.lichHenId, XN, TD, null); // tiep_don ở DaXacNhan
    await preset(b.lichHenId, XN, TD, null); // tiep_don ở VangMat
    await preset(c.lichHenId, XN, TD, '2026-11-10 08:45:00'); // hoan_thanh ở DaTiepDon
    const found = await checkMilestonesMatchState(db);
    expect(found).toHaveLength(3);
    expect(found.map((row) => row['lichHenId'])).toEqual(
      expect.arrayContaining([a.lichHenId, b.lichHenId, c.lichHenId]),
    );
    await expect(assertBookingInvariants(db)).rejects.toThrow(
      /INV-06 \(3 hàng\)/,
    );
  });
});

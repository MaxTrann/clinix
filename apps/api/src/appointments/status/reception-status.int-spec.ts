import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import {
  atRemaining,
  DEPOSIT,
  HALF_REFUND,
  HOUR_MS,
  REFUND_POLICY,
} from '../testing/cancel-world.js';
import { failureOf } from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  notificationRows,
  resetBookingRound,
} from '../testing/payment-doctor-fakes.js';
import {
  AFTER_ALL_WINDOWS,
  ALL_STATES,
  createStatusStack,
  IN_WINDOW,
  readNoShow,
  setNoShow,
  WINDOW_END,
  WINDOW_START,
  type StatusStack,
  type StatusWorld,
} from '../testing/status-world.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import type { ReceptionStatusResult } from './reception-status.dto.js';

// Task B12 — `ReceptionStatusService` (dịch vụ điều phối của route Lễ tân) trên MySQL 8.4 THẬT (PLAN booking 5.7, 7.5 CT-01…CT-10, CT-12, 7.9 QB-04; TRACKING 3.26 B12-E, B12-H): huỷ theo bậc, tiếp đón trong cửa sổ và đủ tiền, Vắng mặt sau cửa sổ,
// mọi mã lỗi và `chiTiet`, 404 cùng thân, thiếu cấu hình, thông báo đúng tài khoản đặt. HTTP thật (DTO, vai trò, `no-store`, route ⇔ `chuyenDuoc[]`): test/booking-reception-status.e2e-spec.ts. Cổng thanh toán là bản `Fake` (số còn phải thu
// do test quyết; B17 chạy lại CT-05, CT-06 với thanh toán thật); thông báo GHI THẬT dòng `thong_bao`. Đồng hồ ứng dụng giả = T0 rồi đặt lại từng ca bằng `vi.setSystemTime`.
const { CANCELLED, NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;
const NOT_FOUND = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const MISSING_CODE = 'CLX-20261110-ZZZZZ';

useStatusWorldHooks();

/** Lễ tân của chi nhánh thế giới đổi trạng thái lịch `maLichHen` */
const change = (
  w: StatusWorld,
  stack: StatusStack,
  maLichHen: string,
  trangThai: TrangThaiLichHen,
  lyDo?: string,
): Promise<ReceptionStatusResult> =>
  stack.reception.change(w.receptionId, maLichHen, {
    trangThai,
    ...(lyDo === undefined ? {} : { lyDo }),
  });

/** Dữ liệu dựng lại SẠCH rồi một lịch ở khung giờ số 0 */
async function fresh(
  w: StatusWorld,
  trangThai: TrangThaiLichHen = 'DaXacNhan',
  options: Parameters<StatusWorld['booked']>[2] = {},
) {
  await resetBookingRound(db);
  return w.booked(trangThai, 0, options);
}

/** Một lịch `DaXacNhan` mới, bộ dịch vụ mới và đồng hồ ứng dụng ở `at`; `slotBefore` là trạng thái khung giờ TRƯỚC khi đổi */
async function arrange(at: Date) {
  const w = await world();
  const stack = createStatusStack(db);
  const lich = await fresh(w);
  const slotBefore = await fx.slotState(w.slotId(0));
  vi.setSystemTime(at);
  return { w, stack, lich, slotBefore };
}

/** `change` bị từ chối 409 với `body` (một phần) và lịch cùng khung giờ không đổi một byte so với ảnh chụp TRƯỚC */
async function expectRefused(
  w: StatusWorld,
  stack: StatusStack,
  lich: Awaited<ReturnType<typeof fresh>>,
  trangThai: TrangThaiLichHen,
  body: Record<string, unknown>,
) {
  const before = await w.snapshot(lich, 0);
  const failure = await failureOf(change(w, stack, lich.maLichHen, trangThai));
  expect(failure.status).toBe(409);
  expect(failure.body).toMatchObject(body);
  expect(await w.snapshot(lich, 0)).toEqual(before);
}

describe('CT-01, CT-02 Lễ tân huỷ (DaHuy, lyDo bắt buộc): theo bậc cùng thời điểm (Q17), khung giờ ConTrong, thông báo, cổng sau commit', () => {
  it('CT-01 lịch DaXacNhan đã thu cọc, còn 23 giờ (mốc 2 giờ ⇒ 50%): DaHuy, ly_do_huy đã cắt khoảng trắng, hoàn 50.000 qua cổng ĐÚNG một lần, mời danh sách chờ một lần, thông báo LichHenDaHuy cho tài khoản đặt', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w, 'DaXacNhan', {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    stack.ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    atRemaining(23 * HOUR_MS);
    const result = await change(
      w,
      stack,
      lich.maLichHen,
      'DaHuy',
      '  Bệnh nhân gọi điện xin huỷ  ',
    );
    expect(result).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaHuy',
      hoanCoc: HALF_REFUND,
    });
    const row = await readAppointment(db, lich.lichHenId);
    expect(row).toMatchObject({
      trangThai: 'DaHuy',
      lyDo: 'Bệnh nhân gọi điện xin huỷ',
    });
    expect(await fx.slotState(w.slotId(0))).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(stack.ports.refund.refundCall.count).toBe(1);
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(1);
    expect(await notificationRows(db)).toEqual([
      { taiKhoanId: w.patientId, lichHenId: lich.lichHenId, loai: CANCELLED },
    ]);
    await assertBookingInvariants(db);
  });

  it('CT-02 lịch ChoThanhToan: huỷ được (chưa thu ⇒ hoanCoc null, không gọi cổng hoàn), khung giờ ConTrong', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w, 'ChoThanhToan');
    const result = await change(w, stack, lich.maLichHen, 'DaHuy', 'Đổi ý');
    expect(result).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaHuy',
      hoanCoc: null,
    });
    expect(await fx.slotState(w.slotId(0))).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    expect(stack.ports.refund.refundCall.count).toBe(0);
  });

  it('huỷ KHÔNG cần cấu hình hệ thống (CT-10): xoá dòng cấu hình rồi huỷ vẫn chạy', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    await db.query('DELETE FROM cau_hinh_he_thong');
    expect(
      await change(w, stack, lich.maLichHen, 'DaHuy', 'Thiếu cấu hình'),
    ).toMatchObject({ trangThai: 'DaHuy' });
  });
});

describe('CT-03, CT-04 Lễ tân đánh Vắng mặt: chỉ SAU hết cửa sổ (now > thoi_gian + 15 phút), cộng no-show, khung giờ giữ DaDat, không mời chờ', () => {
  it('CT-03 sau hết cửa sổ: VangMat, so_lan_no_show của tài khoản đặt +1, khung giờ DaDat, WaitlistPort không được gọi, thông báo LichHenVangMat', async () => {
    const { w, stack, lich, slotBefore } = await arrange(AFTER_ALL_WINDOWS);
    expect(await change(w, stack, lich.maLichHen, 'VangMat')).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'VangMat',
    });
    expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
      'VangMat',
    );
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
    expect(await fx.slotState(w.slotId(0))).toEqual(slotBefore);
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(await notificationRows(db)).toEqual([
      { taiKhoanId: w.patientId, lichHenId: lich.lichHenId, loai: NO_SHOW },
    ]);
    await assertBookingInvariants(db);
  });

  it('CT-04 trước và trong cửa sổ, và ĐÚNG mốc thoi_gian + 15 phút (còn trong cửa sổ) ⇒ 409 CHUA_QUA_GIO_HEN, không đổi gì; +1 giây ⇒ được', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    const before = await w.snapshot(lich, 0);
    for (const at of [
      new Date(WINDOW_START.getTime() - 1000),
      IN_WINDOW,
      WINDOW_END,
    ]) {
      vi.setSystemTime(at);
      const failure = await failureOf(
        change(w, stack, lich.maLichHen, 'VangMat'),
      );
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('CHUA_QUA_GIO_HEN');
      expect(await w.snapshot(lich, 0)).toEqual(before);
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 0,
        khoa: false,
      });
    }
    vi.setSystemTime(new Date(WINDOW_END.getTime() + 1000));
    expect(await change(w, stack, lich.maLichHen, 'VangMat')).toMatchObject({
      trangThai: 'VangMat',
    });
  });

  it('đạt ngưỡng no-show qua route: số mới 3 ⇒ cờ khoá bật và thông báo KhoaDatLichNoShow đúng MỘT lần (VM-05 qua route)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    await change(w, stack, lich.maLichHen, 'VangMat');
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 3, khoa: true });
    expect((await notificationRows(db)).map((row) => row.loai)).toEqual([
      NO_SHOW,
      NO_SHOW_LOCK,
    ]);
  });
});

describe('CT-05, CT-06, CT-07 Lễ tân tiếp đón (DaTiepDon): đủ tiền (A2) và trong cửa sổ đóng hai đầu (Q22)', () => {
  it('CT-05 đủ tiền (cổng giả trả 0), trong cửa sổ: DaTiepDon, khung giờ giữ DaDat, không thông báo, không mời chờ', async () => {
    const { w, stack, lich, slotBefore } = await arrange(IN_WINDOW);
    expect(await change(w, stack, lich.maLichHen, 'DaTiepDon')).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaTiepDon',
    });
    expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
      'DaTiepDon',
    );
    expect(await fx.slotState(w.slotId(0))).toEqual(slotBefore);
    expect(await notificationRows(db)).toEqual([]);
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  });

  it('CT-06 còn phải thu: 409 CON_PHAN_CHUA_THANH_TOAN kèm conPhaiThu, không đổi gì', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    stack.ports.paymentSummary.remaining({ [lich.lichHenId]: '50000.00' });
    vi.setSystemTime(IN_WINDOW);
    await expectRefused(w, stack, lich, 'DaTiepDon', {
      maLoi: 'CON_PHAN_CHUA_THANH_TOAN',
      chiTiet: { conPhaiThu: '50000.00' },
    });
  });

  it('CT-07 hai biên: đúng thoi_gian − 30 phút và đúng thoi_gian + 15 phút được; sớm hơn hay muộn hơn 1 giây ⇒ 409 NGOAI_KHUNG_GIO_TIEP_DON kèm tu, den (ISO UTC)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    for (const [at, allowed] of [
      [WINDOW_START, true],
      [new Date(WINDOW_START.getTime() - 1000), false],
      [WINDOW_END, true],
      [new Date(WINDOW_END.getTime() + 1000), false],
    ] as const) {
      const lich = await fresh(w);
      vi.setSystemTime(at);
      if (allowed) {
        expect(
          await change(w, stack, lich.maLichHen, 'DaTiepDon'),
          at.toISOString(),
        ).toMatchObject({ trangThai: 'DaTiepDon' });
        continue;
      }
      await expectRefused(w, stack, lich, 'DaTiepDon', {
        maLoi: 'NGOAI_KHUNG_GIO_TIEP_DON',
        chiTiet: {
          tu: WINDOW_START.toISOString(),
          den: WINDOW_END.toISOString(),
        },
      });
    }
  });

  it('còn nợ VÀ ngoài cửa sổ: báo còn nợ trước (đúng thứ tự canTransition)', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    stack.ports.paymentSummary.remaining({ [lich.lichHenId]: '1.00' });
    const failure = await failureOf(
      change(w, stack, lich.maLichHen, 'DaTiepDon'),
    );
    expect(failure.body.maLoi).toBe('CON_PHAN_CHUA_THANH_TOAN');
  });
});

describe('CT-08, MT-03 chuyển không hợp lệ: đích DaHuy ⇒ LICH_HEN_KHONG_CHO_HUY, HoanThanh ⇒ CHI_BAC_SI_HOAN_THANH, mọi đích khác ⇒ CHUYEN_TRANG_THAI_KHONG_HOP_LE; không đổi một byte', () => {
  // Bốn ô Lễ tân ĐƯỢC phép (ma trận 5.2): nguồn > đích; các ô còn lại bị từ chối
  const ALLOWED = new Set([
    'ChoThanhToan>DaHuy',
    'DaXacNhan>DaHuy',
    'DaXacNhan>DaTiepDon',
    'DaXacNhan>VangMat',
  ]);
  const expectedCode = (to: TrangThaiLichHen): string =>
    to === 'DaHuy'
      ? 'LICH_HEN_KHONG_CHO_HUY'
      : to === 'HoanThanh'
        ? 'CHI_BAC_SI_HOAN_THANH'
        : 'CHUYEN_TRANG_THAI_KHONG_HOP_LE';

  it.each(ALL_STATES)(
    'nguồn %s với từng đích bị từ chối: đúng mã, đúng chiTiet, DB không đổi',
    async (from) => {
      const w = await world();
      const stack = createStatusStack(db);
      for (const to of ALL_STATES) {
        if (ALLOWED.has(`${from}>${to}`)) continue;
        const lich = await fresh(w, from);
        const before = await w.snapshot(lich, 0);
        const failure = await failureOf(
          change(w, stack, lich.maLichHen, to, 'Lý do thử nghiệm'),
        );
        expect(failure.status, `${from} sang ${to}`).toBe(409);
        expect(failure.body.maLoi, `${from} sang ${to}`).toBe(expectedCode(to));
        if (to === 'DaHuy')
          expect(failure.body.chiTiet).toEqual({ trangThai: from });
        else if (to !== 'HoanThanh')
          expect(failure.body.chiTiet).toEqual({
            tuTrangThai: from,
            denTrangThai: to,
          });
        expect(await w.snapshot(lich, 0), `${from} sang ${to}`).toEqual(before);
        expect(await notificationRows(db)).toEqual([]);
      }
      expect(stack.ports.refund.refundCall.count).toBe(0);
      expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    },
  );

  it('bấm đúp: huỷ lần hai ⇒ 409 LICH_HEN_KHONG_CHO_HUY (trangThai DaHuy); đánh Vắng mặt lần hai ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE và KHÔNG cộng số lần thứ hai', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const cancelled = await fresh(w);
    await change(w, stack, cancelled.maLichHen, 'DaHuy', 'Lần một');
    const second = await failureOf(
      change(w, stack, cancelled.maLichHen, 'DaHuy', 'Lần hai'),
    );
    expect(second.body).toMatchObject({
      maLoi: 'LICH_HEN_KHONG_CHO_HUY',
      chiTiet: { trangThai: 'DaHuy' },
    });

    const noShow = await fresh(w);
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    await change(w, stack, noShow.maLichHen, 'VangMat');
    const again = await failureOf(
      change(w, stack, noShow.maLichHen, 'VangMat'),
    );
    expect(again.body).toMatchObject({
      maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
      chiTiet: { tuTrangThai: 'VangMat', denTrangThai: 'VangMat' },
    });
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
  });
});

describe('CT-09 lịch ở chi nhánh khác hay không tồn tại: 404 cùng thân; tài khoản không phải Lễ tân: 403', () => {
  it('Lễ tân của chi nhánh KHÁC nhận 404 KHONG_TIM_THAY với MỌI đích (kể cả HoanThanh và đích bị từ chối, không lộ trạng thái); lịch không tồn tại cùng một thân; không đổi gì', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w, 'DaHuy');
    const before = await w.snapshot(lich, 0);
    for (const to of ALL_STATES)
      for (const code of [lich.maLichHen, MISSING_CODE]) {
        const failure = await failureOf(
          stack.reception.change(w.otherReceptionId, code, {
            trangThai: to,
            lyDo: 'Lý do',
          }),
        );
        expect(failure.status, `${to} ${code}`).toBe(404);
        expect(failure.body, `${to} ${code}`).toEqual(NOT_FOUND);
      }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(stack.ports.refund.refundCall.count).toBe(0);
  });

  it('tài khoản KHÔNG phải Lễ tân (Bệnh nhân) ⇒ 403 KHONG_DU_QUYEN trước mọi thứ, không đổi gì', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    const before = await w.snapshot(lich, 0);
    for (const to of ['DaHuy', 'DaTiepDon', 'VangMat', 'HoanThanh'] as const) {
      const failure = await failureOf(
        stack.reception.change(w.patientId, lich.maLichHen, {
          trangThai: to,
          lyDo: 'x',
        }),
      );
      expect(failure.status).toBe(403);
      expect(failure.body.maLoi).toBe('KHONG_DU_QUYEN');
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
  });
});

describe('CT-10 thiếu cau_hinh_he_thong: DaTiepDon và VangMat ⇒ 409 HE_THONG_CHUA_CAU_HINH; DaHuy vẫn chạy', () => {
  it('xoá dòng cấu hình: tiếp đón và Vắng mặt ⇒ 409 HE_THONG_CHUA_CAU_HINH (không đổi gì); huỷ vẫn được', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const lich = await fresh(w);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const before = await w.snapshot(lich, 0);
    for (const to of ['DaTiepDon', 'VangMat'] as const) {
      const failure = await failureOf(change(w, stack, lich.maLichHen, to));
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    }
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 0,
      khoa: false,
    });
    expect(
      await change(w, stack, lich.maLichHen, 'DaHuy', 'Vẫn huỷ được'),
    ).toMatchObject({ trangThai: 'DaHuy' });
  });

  it('thứ tự: "nguồn không hợp lệ" và 404 đứng TRƯỚC 409 HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    const cancelled = await fresh(w, 'DaHuy');
    await db.query('DELETE FROM cau_hinh_he_thong');
    expect(
      (await failureOf(change(w, stack, cancelled.maLichHen, 'DaTiepDon'))).body
        .maLoi,
    ).toBe('CHUYEN_TRANG_THAI_KHONG_HOP_LE');
    const other = await failureOf(
      stack.reception.change(w.otherReceptionId, cancelled.maLichHen, {
        trangThai: 'VangMat',
      }),
    );
    expect(other.status).toBe(404);
  });
});

describe('CT-12 thông báo cho TÀI KHOẢN ĐẶT khi lịch của hồ sơ người thân (không phải người thân)', () => {
  it('huỷ và Vắng mặt lịch của hồ sơ người thân: LichHenDaHuy và LichHenVangMat đi cho Bệnh nhân đặt; bộ đếm cộng cho Bệnh nhân đặt', async () => {
    const w = await world();
    const stack = createStatusStack(db);
    await resetBookingRound(db);
    const huy = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    const vang = await w.booked('DaXacNhan', 1, {
      hoSoNguoiThanId: w.relativeId,
    });
    await change(w, stack, huy.maLichHen, 'DaHuy', 'Người thân báo huỷ');
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    await change(w, stack, vang.maLichHen, 'VangMat');
    expect(await notificationRows(db)).toEqual([
      { taiKhoanId: w.patientId, lichHenId: huy.lichHenId, loai: CANCELLED },
      { taiKhoanId: w.patientId, lichHenId: vang.lichHenId, loai: NO_SHOW },
    ]);
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
  });
});

import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PatientAppointmentDetailService } from '../lists/patient-appointment-detail.service.js';
import { PatientAppointmentsRepository } from '../lists/patient-appointments.repository.js';
import { NoopPaymentSummaryPort } from '../ports/payment.port.js';
import { NoopRefundPort } from '../ports/wallet.port.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { isLockingStatement } from '../testing/query-spy.js';
import { realRescheduleDetailReader } from '../testing/reschedule-detail-world.js';
import {
  insertRequestAt,
  requestWorld,
  setSelfRescheduleCount,
} from '../testing/reschedule-request-world.js';
import {
  interceptStatements,
  type StatementCall,
} from '../testing/statement-recorder.js';

// reschedule B5 — DLH-15, DLH-42, DLH-43, DLH-45, DLH-46 phần I (PLAN reschedule 5.8, 7.2; hợp đồng web F1 mục 6 và 8) trên MySQL 8.4 THẬT: hai khoá đổi lịch của chi tiết lịch. Bệnh nhân qua
// `PatientAppointmentDetailService` THẬT (cổng thanh toán và hoàn tiền là `Noop` dựng tay), Lễ tân qua `RescheduleDetailReader.forReception`; chi tiết Lễ tân qua `ReceptionAppointmentsService` ở
// `reception-appointments.int-spec.ts`. Đồng hồ ứng dụng giả = 02/11/2026 08:00 giờ Việt Nam (= 01:00 UTC); lịch cũ ở 08:00 ngày 10/11/2026 (= 01:00 UTC), khung giờ mong muốn mặc định 09:00.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const detailService = () => {
  const payments = new NoopPaymentSummaryPort();
  const refunds = new NoopRefundPort();
  payments.logger = { warn: vi.fn() };
  refunds.logger = { warn: vi.fn() };
  return new PatientAppointmentDetailService(
    db,
    new PatientAppointmentsRepository(),
    payments,
    refunds,
    realRescheduleDetailReader(db),
  );
};

const NOW_TEXT = '2026-11-02 08:00:00';
const T0_ISO = '2026-11-02T01:00:00.000Z';

describe('DLH-15 chi tiết Bệnh nhân: choPhepDoiLich và yeuCauDoiLich qua các giai đoạn của yêu cầu', () => {
  it('hết lần tự đổi, chưa có yêu cầu ⇒ choPhepDoiLich true, yeuCauDoiLich null; có ChoDuyet ⇒ false và yêu cầu ChoDuyet; sau TuChoi ⇒ true và TuChoi kèm ghi chú', async () => {
    const w = await requestWorld(db, fx);
    const service = detailService();
    const none = await service.detail(w.patientId, w.old.maLichHen);
    expect(none.choPhepDoiLich).toBe(true);
    expect(none.yeuCauDoiLich).toBeNull();
    expect(Object.keys(none)).toHaveLength(19);

    const created = await w.request();
    if (created.kind !== 'RequestCreated') return expect.fail(created.kind);
    const pending = await service.detail(w.patientId, w.old.maLichHen);
    expect(pending.choPhepDoiLich).toBe(false);
    expect(pending.yeuCauDoiLich).toStrictEqual({
      trangThai: 'ChoDuyet',
      thoiGianMongMuon: '2026-11-10T02:00:00.000Z',
      ghiChuXuLy: null,
      thoiDiemTao: T0_ISO,
    });

    await db.query(
      `UPDATE yeu_cau_doi_lich_ngoai_chinh_sach
          SET trang_thai = 'TuChoi', ghi_chu_xu_ly = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ?
        WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ?`,
      ['Bác sĩ nghỉ phép hôm đó', w.patientId, NOW_TEXT, created.yeuCauId],
    );
    const rejected = await service.detail(w.patientId, w.old.maLichHen);
    expect(rejected.choPhepDoiLich).toBe(true);
    expect(rejected.yeuCauDoiLich).toStrictEqual({
      trangThai: 'TuChoi',
      thoiGianMongMuon: '2026-11-10T02:00:00.000Z',
      ghiChuXuLy: 'Bác sĩ nghỉ phép hôm đó',
      thoiDiemTao: T0_ISO,
    });
  });

  it('còn lần tự đổi (1 trên 2) ⇒ choPhepDoiLich true; hết (2 trên 2) mà lịch không còn DaXacNhan ⇒ false', async () => {
    const w = await requestWorld(db, fx, { soLanTuDoiLich: 1 });
    expect(
      (await detailService().detail(w.patientId, w.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(true);
    const cancelled = await requestWorld(db, fx, { oldState: 'DaHuy' });
    expect(
      (
        await detailService().detail(
          cancelled.patientId,
          cancelled.old.maLichHen,
        )
      ).choPhepDoiLich,
    ).toBe(false);
  });

  it('quá giờ hẹn của lịch cũ (đúng giờ hẹn là ĐÃ qua) ⇒ choPhepDoiLich false', async () => {
    const w = await requestWorld(db, fx);
    vi.setSystemTime(new Date('2026-11-10T07:59:59+07:00'));
    expect(
      (await detailService().detail(w.patientId, w.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(true);
    vi.setSystemTime(new Date('2026-11-10T08:00:00+07:00'));
    expect(
      (await detailService().detail(w.patientId, w.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(false);
  });

  it('lịch của hồ sơ người thân đã NGỪNG ⇒ choPhepDoiLich false; hồ sơ đang dùng ⇒ true', async () => {
    const stopped = await requestWorld(db, fx, { relative: 'stopped' });
    expect(
      (await detailService().detail(stopped.patientId, stopped.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(false);
    const active = await requestWorld(db, fx, { relative: 'active' });
    expect(
      (await detailService().detail(active.patientId, active.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(true);
  });

  it('lịch DaDoiLich mở bằng mã cũ ⇒ 404 KHONG_TIM_THAY CÙNG thân với mã không tồn tại; lịch của người khác cũng vậy (R7)', async () => {
    const w = await requestWorld(db, fx, { oldState: 'DaDoiLich' });
    const service = detailService();
    const rejection = async (patientId: string, code: string) => {
      const error: unknown = await service
        .detail(patientId, code)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      return JSON.stringify((error as AppException).getResponse());
    };
    const replaced = await rejection(w.patientId, w.old.maLichHen);
    const missing = await rejection(w.patientId, 'CLX-20261109-ZZZZZ');
    expect(replaced).toBe(missing);
    expect(replaced).toContain('KHONG_TIM_THAY');
    const [other] = await fx.patients(1);
    const live = await requestWorld(db, fx);
    expect(await rejection(other!.account.taiKhoanId, live.old.maLichHen)).toBe(
      missing,
    );
  });
});

describe('DLH-43 yeuCauDoiLich là yêu cầu MỚI NHẤT', () => {
  it('ba yêu cầu theo thời gian (TuChoi, TuChoi, ChoDuyet) ⇒ yêu cầu cuối; không có ⇒ null', async () => {
    const w = await requestWorld(db, fx);
    const service = detailService();
    const common = {
      lichHenId: w.old.lichHenId,
      khungGioMongMuonId: w.target,
      nguoiXuLyId: w.patientId,
    };
    await insertRequestAt(db, {
      ...common,
      thoiDiemTao: '2026-11-01 08:00:00',
      trangThai: 'TuChoi',
      ghiChu: 'lần một',
    });
    await insertRequestAt(db, {
      ...common,
      thoiDiemTao: '2026-11-01 09:00:00',
      trangThai: 'TuChoi',
      ghiChu: 'lần hai',
    });
    await insertRequestAt(db, {
      ...common,
      thoiDiemTao: '2026-11-01 10:00:00',
    });
    const latest = (await service.detail(w.patientId, w.old.maLichHen))
      .yeuCauDoiLich;
    expect(latest?.trangThai).toBe('ChoDuyet');
    expect(latest?.thoiDiemTao).toBe('2026-11-01T03:00:00.000Z');
  });

  it('SẮP THEO THỜI ĐIỂM, không theo id: yêu cầu id nhỏ nhưng thoi_diem_tao lớn hơn là yêu cầu mới nhất', async () => {
    const w = await requestWorld(db, fx);
    const common = {
      lichHenId: w.old.lichHenId,
      khungGioMongMuonId: w.target,
      nguoiXuLyId: w.patientId,
    };
    await insertRequestAt(db, {
      ...common,
      thoiDiemTao: '2026-11-01 12:00:00',
      trangThai: 'DaDuyet',
      ghiChu: 'mới hơn theo thời điểm',
    });
    await insertRequestAt(db, {
      ...common,
      thoiDiemTao: '2026-11-01 07:00:00',
      trangThai: 'TuChoi',
      ghiChu: 'cũ hơn nhưng id lớn hơn',
    });
    const latest = (await detailService().detail(w.patientId, w.old.maLichHen))
      .yeuCauDoiLich;
    expect(latest?.ghiChuXuLy).toBe('mới hơn theo thời điểm');
    expect(latest?.trangThai).toBe('DaDuyet');
  });

  it('HOÀ thoi_diem_tao ⇒ yêu cầu có id LỚN nhất', async () => {
    const w = await requestWorld(db, fx);
    const common = {
      lichHenId: w.old.lichHenId,
      khungGioMongMuonId: w.target,
      nguoiXuLyId: w.patientId,
      thoiDiemTao: '2026-11-01 08:00:00',
    };
    await insertRequestAt(db, {
      ...common,
      trangThai: 'DaDuyet',
      ghiChu: 'id nhỏ',
    });
    await insertRequestAt(db, {
      ...common,
      trangThai: 'TuChoi',
      ghiChu: 'id lớn',
    });
    const latest = (await detailService().detail(w.patientId, w.old.maLichHen))
      .yeuCauDoiLich;
    expect(latest?.ghiChuXuLy).toBe('id lớn');
  });

  it('yêu cầu của lịch KHÁC không lẫn vào: lịch chưa có yêu cầu nào ⇒ null dù bảng có yêu cầu của lịch khác', async () => {
    const w = await requestWorld(db, fx);
    const [other] = await fx.patients(1);
    const otherLich = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor,
      khungGioId: w.slotIds[5]!,
      patientId: other!.account.taiKhoanId,
    });
    await insertRequestAt(db, {
      lichHenId: otherLich.lichHenId,
      khungGioMongMuonId: w.target,
      thoiDiemTao: '2026-11-01 08:00:00',
    });
    expect(
      (await detailService().detail(w.patientId, w.old.maLichHen))
        .yeuCauDoiLich,
    ).toBeNull();
  });
});

describe('DLH-44 danh sách trắng ở JSON thật', () => {
  it('không `lyDoYeuCau`, id yêu cầu, người xử lý hay lịch id; chỉ bốn khoá của yêu cầu', async () => {
    const marker = 'LY-DO-RIENG-TU-5531';
    const w = await requestWorld(db, fx);
    const id = await insertRequestAt(db, {
      lichHenId: w.old.lichHenId,
      khungGioMongMuonId: w.target,
      thoiDiemTao: '2026-11-01 08:00:00',
      trangThai: 'TuChoi',
      nguoiXuLyId: w.patientId,
      lyDoYeuCau: `Tôi bận vì ${marker}`,
    });
    const detail = await detailService().detail(w.patientId, w.old.maLichHen);
    const json = JSON.stringify(detail);
    expect(json).not.toContain(marker);
    expect(json).not.toContain('lyDoYeuCau');
    expect(json).not.toContain('nguoiXuLy');
    expect(json).not.toContain(`"${id}"`);
    expect(Object.keys(detail.yeuCauDoiLich ?? {}).sort()).toStrictEqual([
      'ghiChuXuLy',
      'thoiDiemTao',
      'thoiGianMongMuon',
      'trangThai',
    ]);
  });
});

describe('DLH-42 thiếu cấu hình ⇒ false và KHÔNG 409', () => {
  it('chi tiết Bệnh nhân vẫn đọc được, choPhepDoiLich false, đủ 19 khoá, yeuCauDoiLich vẫn hiện', async () => {
    const w = await requestWorld(db, fx);
    await w.request();
    await db.query('DELETE FROM cau_hinh_he_thong');
    const detail = await detailService().detail(w.patientId, w.old.maLichHen);
    expect(detail.choPhepDoiLich).toBe(false);
    expect(detail.yeuCauDoiLich?.trangThai).toBe('ChoDuyet');
    expect(Object.keys(detail)).toHaveLength(19);
  });

  it('giá trị cấu hình hỏng (so_lan_tu_doi_lich_toi_da âm không lưu được: CHECK) nên chỉ kiểm thiếu dòng; Lễ tân: choPhepDoiLich false nhưng coYeuCauChoDuyet vẫn đúng', async () => {
    const w = await requestWorld(db, fx);
    await w.request();
    await db.query('DELETE FROM cau_hinh_he_thong');
    const view = await db.transaction(async (em) =>
      realRescheduleDetailReader(db).forReception(em, {
        chiNhanhId: w.doctor.chiNhanhId,
        maLichHen: w.old.maLichHen,
        now: new Date('2026-11-02T01:00:00.000Z'),
      }),
    );
    expect(view).toStrictEqual({
      choPhepDoiLich: false,
      coYeuCauChoDuyet: true,
    });
  });
});

describe('DLH-45 Lễ tân: vai DoiHo trong chi nhánh của họ', () => {
  const view = (
    w: Awaited<ReturnType<typeof requestWorld>>,
    chiNhanhId: string,
    now = '2026-11-02T01:00:00.000Z',
  ) =>
    db.transaction((em) =>
      realRescheduleDetailReader(db).forReception(em, {
        chiNhanhId,
        maLichHen: w.old.maLichHen,
        now: new Date(now),
      }),
    );

  it('đổi hộ KHÔNG bị hạn mức: hết lần tự đổi (9 trên 2) vẫn choPhepDoiLich true; chưa có yêu cầu chờ ⇒ coYeuCauChoDuyet false', async () => {
    const w = await requestWorld(db, fx);
    await setSelfRescheduleCount(db, w.old.lichHenId, 9);
    expect(await view(w, w.doctor.chiNhanhId)).toStrictEqual({
      choPhepDoiLich: true,
      coYeuCauChoDuyet: false,
    });
  });

  it('đang có yêu cầu CHỜ DUYỆT: Lễ tân VẪN đổi hộ được (KDL-19) và coYeuCauChoDuyet true, trong khi Bệnh nhân bị chặn', async () => {
    const w = await requestWorld(db, fx);
    expect((await w.request()).kind).toBe('RequestCreated');
    expect(await view(w, w.doctor.chiNhanhId)).toStrictEqual({
      choPhepDoiLich: true,
      coYeuCauChoDuyet: true,
    });
    expect(
      (await detailService().detail(w.patientId, w.old.maLichHen))
        .choPhepDoiLich,
    ).toBe(false);
  });

  it('lịch tồn (đã huỷ) còn yêu cầu chờ ⇒ không đổi hộ được nhưng coYeuCauChoDuyet vẫn true (R6)', async () => {
    const w = await requestWorld(db, fx, { oldState: 'DaHuy' });
    await insertRequestAt(db, {
      lichHenId: w.old.lichHenId,
      khungGioMongMuonId: w.target,
      thoiDiemTao: '2026-11-01 08:00:00',
    });
    expect(await view(w, w.doctor.chiNhanhId)).toStrictEqual({
      choPhepDoiLich: false,
      coYeuCauChoDuyet: true,
    });
  });

  it('hạn đổi hộ = giờ hẹn + check_in_sau_phut (15): 08:14:59 còn, 08:15:00 đã hết (nửa mở)', async () => {
    const w = await requestWorld(db, fx);
    const at = (clock: string) =>
      view(
        w,
        w.doctor.chiNhanhId,
        new Date(`2026-11-10T${clock}+07:00`).toISOString(),
      );
    expect((await at('08:14:59')).choPhepDoiLich).toBe(true);
    expect((await at('08:15:00')).choPhepDoiLich).toBe(false);
  });

  it('chi nhánh KHÁC ⇒ không thấy lịch: choPhepDoiLich false và coYeuCauChoDuyet false (không lộ yêu cầu chờ)', async () => {
    const w = await requestWorld(db, fx);
    await w.request();
    expect(await view(w, '999999')).toStrictEqual({
      choPhepDoiLich: false,
      coYeuCauChoDuyet: false,
    });
  });
});

describe('DLH-46 chi tiết chỉ đọc', () => {
  it('chi tiết Bệnh nhân: 0 câu khoá hàng, 0 câu ghi; mọi câu đổi lịch nằm TRONG một giao dịch chỉ đọc cùng hàng lịch', async () => {
    const w = await requestWorld(db, fx);
    await w.request();
    const calls: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      calls.push(call);
      return run();
    });
    await detailService().detail(w.patientId, w.old.maLichHen);
    expect(calls.filter((c) => isLockingStatement(c.sql))).toStrictEqual([]);
    expect(
      calls.filter((c) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(c.sql)),
    ).toStrictEqual([]);
    // Đọc cấu hình đi qua kho cấu hình (ngoài giao dịch chỉ đọc); phần còn lại cùng một giao dịch
    const begin = calls.findIndex((c) => /START TRANSACTION/i.test(c.sql));
    const commit = calls.findIndex((c) => /^\s*COMMIT/i.test(c.sql));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(begin);
    const inside = calls.slice(begin, commit).map((c) => c.sql);
    expect(
      inside.some((sql) => /FROM lich_hen WHERE ma_lich_hen/.test(sql)),
    ).toBe(true);
    expect(
      inside.some((sql) =>
        /FROM yeu_cau_doi_lich_ngoai_chinh_sach yc/.test(sql),
      ),
    ).toBe(true);
    // Ghi số thật để báo cáo: số câu SQL của MỘT lần mở chi tiết
    console.info(
      `[DLH-46] chi tiết Bệnh nhân: ${String(calls.length)} câu SQL (gồm giao dịch)`,
    );
  });
});

import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { readEmails, readThongBao } from '../testing/notification-world.js';
import {
  appFailure,
  lockNoShow,
  patientRescheduleWorld,
  VALID_REASON,
} from '../testing/patient-reschedule-world.js';
import {
  assertRequestSentContract,
  assertRescheduledContract,
} from '../testing/patient-reschedule-contract.js';
import {
  requestRows,
  untouchedState,
  writeCounts,
} from '../testing/reschedule-request-world.js';
import type { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import type {
  RequestSentResult,
  RescheduledResult,
  RescheduleResult,
} from './patient-reschedule.dto.js';
import { PatientRescheduleService } from './patient-reschedule.service.js';

// reschedule B6 — `PatientRescheduleService` (ghép B4 và B5) trên MySQL 8.4 THẬT, cả B4, B5, `BookingNotifier` đều là bản THẬT (cổng nghỉ phép, thay đổi chi nhánh, danh sách chờ là `Fake`): DLH-48 (đổi ngay),
// DLH-56 (hết lần: không lý do, có lý do), DLH-57 (`NotOverQuota` THẬT rồi gọi lại B4), DLH-58 (bấm đúp), DLH-59 (độ dài lý do khi dùng đến), DLH-09 (lịch không xem được, hồ sơ người thân), DLH-22 (cờ no-show),
// DLH-55 (thiếu cấu hình). Đơn vị (từng nhánh `Rejected`, thứ tự gọi, mốc `thoiGianMayChu`): `patient-reschedule.service.spec.ts`; HTTP: `test/booking-patient-reschedule*.e2e-spec.ts`. Đồng hồ ứng dụng giả =
// 02/11/2026 08:00 giờ Việt Nam (`useIntegrationHooks`); `soLanTuDoiLichToiDa` = 2. Mã DLH-48, 55 đến 59 là `[đề xuất]` (TRACKING reschedule 1.10).
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const SLOT_NINE_ISO = new Date('2026-11-10T09:00:00+07:00').toISOString();

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const asDone = (result: RescheduleResult): RescheduledResult => {
  if (result.ketQua !== 'DaDoi') throw new Error(`kết quả ${result.ketQua}`);
  return result;
};
const asSent = (result: RescheduleResult): RequestSentResult => {
  if (result.ketQua !== 'DaGuiYeuCau')
    throw new Error(`kết quả ${result.ketQua}`);
  return result;
};

describe('DLH-48 POST đổi ngay (còn lần tự đổi) trên DB thật', () => {
  it('201 DaDoi đúng hợp đồng; lịch mới DaXacNhan (hằng của mapper khớp DB), lich_hen_truoc_id = cũ, bộ đếm 1, giờ khớp; lịch cũ DaDoiLich; khung giờ cũ ConTrong, mới DaDat; một thông báo; INV-1…INV-10; không yêu cầu', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    const money = await w.moneyBefore();

    const result = asDone(await w.reschedule(old.maLichHen, 2));
    assertRescheduledContract(wire(result));
    expect(result.lichHenCu.maLichHen).toBe(old.maLichHen);
    expect(result.lichHenMoi.thoiGian).toBe(SLOT_NINE_ISO);

    const created = await w.rowOf(
      await w.idOfCode(result.lichHenMoi.maLichHen),
    );
    expect(created).toMatchObject({
      trangThai: result.lichHenMoi.trangThai,
      truoc: old.lichHenId,
      thoiGian: '2026-11-10 09:00:00',
      benhNhanId: w.patientId,
    });
    expect(Number(created.soLan)).toBe(1);
    expect((await w.rowOf(old.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    expect(await requestRows(db)).toEqual([]);
    expect(await readThongBao(db, 'LichHenDaDoiLich')).toHaveLength(1);
    await w.expectSettled(money);
  });

  it('DLH-11 lý do thừa (hợp lệ hay sai độ dài) khi còn lần tự đổi bị BỎ QUA: vẫn 201 DaDoi, không yêu cầu, không thông báo yêu cầu', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const first = await w.book(0);
    const second = await w.book(4);
    asDone(await w.reschedule(first.maLichHen, 2, 'abc'));
    asDone(await w.reschedule(second.maLichHen, 6, VALID_REASON));
    expect(await requestRows(db)).toEqual([]);
    expect(await readThongBao(db, 'YeuCauDoiLichDangCho')).toEqual([]);
    await w.expectSettled();
  });

  it('DLH-22 cờ khoá đặt lịch do no-show bật KHÔNG chặn đổi lịch (Q7 (b))', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    await lockNoShow(db, w.patientId);
    asDone(await w.reschedule(old.maLichHen, 2));
    await w.expectSettled();
  });
});

describe('DLH-56 POST đã hết lần tự đổi (so_lan_tu_doi_lich = toiDa = 2)', () => {
  it('KHÔNG lý do ⇒ 409 VUOT_SO_LAN_TU_DOI chiTiet { soLanDaDoi: 2, toiDa: 2 }; không ghi gì (ảnh chụp và số hàng nguyên)', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(db);
    const counts = await writeCounts(db);

    const failure = await appFailure(w.reschedule(old.maLichHen, 2));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('VUOT_SO_LAN_TU_DOI');
    expect(failure.body.chiTiet).toEqual({ soLanDaDoi: 2, toiDa: 2 });
    expect(await untouchedState(db)).toEqual(before);
    expect(await writeCounts(db)).toEqual(counts);
  });

  it('CÓ lý do ⇒ 201 DaGuiYeuCau (không id yêu cầu): một yêu cầu ChoDuyet đúng cột, lịch cũ và hai khung giờ KHÔNG đổi, khung giờ mong muốn vẫn ConTrong, đúng một thông báo YeuCauDoiLichDangCho kèm một thư ChoGui', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(db);

    const result = asSent(
      await w.reschedule(old.maLichHen, 2, `  ${VALID_REASON}  `),
    );
    assertRequestSentContract(wire(result));
    expect(result.yeuCau.thoiGianMongMuon).toBe(SLOT_NINE_ISO);

    expect(await requestRows(db)).toMatchObject([
      {
        lichHenId: old.lichHenId,
        khungGioMongMuonId: w.slot(2),
        lyDoYeuCau: VALID_REASON,
        trangThai: 'ChoDuyet',
      },
    ]);
    expect(await untouchedState(db)).toEqual(before);
    await w.expectSlot(2, 'ConTrong');
    expect(await readThongBao(db, 'YeuCauDoiLichDangCho')).toHaveLength(1);
    expect(await readEmails(db)).toMatchObject([{ trangThai: 'ChoGui' }]);
    await w.expectSettled();
  });

  it('thứ tự lỗi khi hết lần (ghi nhận, hợp đồng B4): khung giờ đã có người đặt mà KHÔNG lý do ⇒ VUOT_SO_LAN_TU_DOI; CÓ lý do ⇒ KHUNG_GIO_DA_DAT (B5 chạy đủ chín bước)', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    const other = await fx.admin.patient();
    await w.book(2, { patientId: other.account.taiKhoanId });

    expect((await appFailure(w.reschedule(old.maLichHen, 2))).body.maLoi).toBe(
      'VUOT_SO_LAN_TU_DOI',
    );
    const booked = await appFailure(
      w.reschedule(old.maLichHen, 2, VALID_REASON),
    );
    expect(booked.status).toBe(409);
    expect(booked.body.maLoi).toBe('KHUNG_GIO_DA_DAT');
    expect(await requestRows(db)).toEqual([]);
  });
});

describe('DLH-59 POST lý do yêu cầu: độ dài chỉ kiểm khi dùng đến (đếm điểm mã)', () => {
  it.each([
    ['4 ký tự', 'abcd'],
    ['501 ký tự', 'a'.repeat(501)],
    ['501 emoji (mỗi emoji một điểm mã)', '😀'.repeat(501)],
  ])(
    '%s ⇒ 400 DU_LIEU_KHONG_HOP_LE lyDoYeuCau LY_DO_YEU_CAU_KHONG_HOP_LE; DB nguyên',
    async (_name, reason) => {
      const w = await patientRescheduleWorld(db, fx);
      const old = await w.book(0, { soLan: 2 });
      const before = await untouchedState(db);
      const counts = await writeCounts(db);
      const failure = await appFailure(w.reschedule(old.maLichHen, 2, reason));
      expect(failure.status).toBe(400);
      expect(failure.body.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
      expect(failure.body.loi).toEqual([
        { truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' },
      ]);
      expect(await untouchedState(db)).toEqual(before);
      expect(await writeCounts(db)).toEqual(counts);
    },
  );

  it.each([
    ['biên dưới 5 ký tự', 'abcde'],
    ['biên trên 500 điểm mã (1000 đơn vị UTF-16)', '😀'.repeat(500)],
  ])('%s ⇒ 201 DaGuiYeuCau, lý do lưu nguyên', async (_name, reason) => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    asSent(await w.reschedule(old.maLichHen, 2, reason));
    expect(await requestRows(db)).toMatchObject([{ lyDoYeuCau: reason }]);
  });
});

describe('DLH-57 POST: B5 trả NotOverQuota THẬT rồi B4 chạy lại đúng một lần', () => {
  it('lịch còn lần (so_lan 1 < toiDa 2) nhưng B4 giả báo OverQuota lần đầu ⇒ B5 thật trả NotOverQuota ⇒ B4 thật đổi lịch: 201 DaDoi, B4 gọi 2 lần, không yêu cầu, đúng MỘT lịch mới', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 1 });
    const reschedule = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'OverQuota', soLanDaDoi: 2, toiDa: 2 })
      .mockImplementation(
        (input: Parameters<AppointmentRescheduleService['reschedule']>[0]) =>
          w.core.reschedule(input),
      );
    const service = new PatientRescheduleService(
      { reschedule } as unknown as AppointmentRescheduleService,
      w.requests,
    );
    const result = asDone(
      await service.reschedule(w.patientId, old.maLichHen, {
        khungGioId: w.slot(2),
        lyDoYeuCau: VALID_REASON,
      }),
    );
    expect(reschedule).toHaveBeenCalledTimes(2);
    expect(await requestRows(db)).toEqual([]);
    expect(await w.countRows('lich_hen')).toBe(2);
    expect(
      Number(
        (await w.rowOf(await w.idOfCode(result.lichHenMoi.maLichHen))).soLan,
      ),
    ).toBe(2);
    await w.expectSettled();
  });
});

describe('DLH-58 POST bấm đúp', () => {
  it('đổi ngay: lần hai (lịch cũ đã DaDoiLich) ⇒ 404 CÙNG thân; đúng MỘT lịch mới', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    asDone(await w.reschedule(old.maLichHen, 2));
    const second = await appFailure(w.reschedule(old.maLichHen, 2));
    expect(second.status).toBe(404);
    expect(second.body).toEqual(NOT_FOUND_BODY);
    expect(await w.countRows('lich_hen')).toBe(2);
  });

  it('gửi yêu cầu: lần hai ⇒ 409 DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET; đúng MỘT yêu cầu', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0, { soLan: 2 });
    asSent(await w.reschedule(old.maLichHen, 2, VALID_REASON));
    const second = await appFailure(
      w.reschedule(old.maLichHen, 2, VALID_REASON),
    );
    expect(second.status).toBe(409);
    expect(second.body.maLoi).toBe('DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET');
    expect(await requestRows(db)).toHaveLength(1);
  });

  it('hai POST ĐỒNG THỜI cùng thân: đúng một 201 DaDoi và một 404; một lịch mới; INV', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    const settled = await Promise.allSettled([
      w.reschedule(old.maLichHen, 2),
      w.reschedule(old.maLichHen, 2),
    ]);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason as unknown;
    expect(reason).toBeInstanceOf(AppException);
    expect((reason as AppException).getStatus()).toBe(404);
    expect((reason as AppException).getResponse()).toEqual(NOT_FOUND_BODY);
    expect(await w.countRows('lich_hen')).toBe(2);
    await w.expectSettled();
  });
});

describe('DLH-09 POST: lịch không xem được ⇒ 404 CÙNG thân; hồ sơ người thân của chính mình đổi được', () => {
  it('của người khác, hồ sơ người thân của tài khoản khác, không tồn tại, đã DaDoiLich ⇒ 404 giống từng ký tự; DB nguyên', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const other = await w.otherPatient(4);
    const mine = await w.book(0);
    asDone(await w.reschedule(mine.maLichHen, 2));
    const before = await untouchedState(db);

    for (const code of [
      other.own.maLichHen,
      other.viaRelative.maLichHen,
      'CLX-20261110-ZZZZZ',
      mine.maLichHen,
    ]) {
      const failure = await appFailure(w.reschedule(code, 6, VALID_REASON));
      expect(failure.status).toBe(404);
      expect(failure.body).toEqual(NOT_FOUND_BODY);
    }
    expect(await untouchedState(db)).toEqual(before);
  });

  it('QDL-06 lịch của HỒ SƠ NGƯỜI THÂN do chính mình quản lý ⇒ đổi được (201 DaDoi); lịch mới giữ hồ sơ người thân', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const viaRelative = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    const result = asDone(await w.reschedule(viaRelative.maLichHen, 2));
    const created = await w.rowOf(
      await w.idOfCode(result.lichHenMoi.maLichHen),
    );
    expect(created.hoSoNguoiThanId).toBe(w.relativeId);
    await w.expectSettled();
  });

  it('hồ sơ người thân đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG; DB nguyên', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const stopped = await w.book(0, { hoSoNguoiThanId: w.stoppedRelativeId });
    const before = await untouchedState(db);
    const failure = await appFailure(w.reschedule(stopped.maLichHen, 2));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await untouchedState(db)).toEqual(before);
  });
});

describe('DLH-55 POST: thiếu cấu hình hệ thống', () => {
  it('xoá dòng cau_hinh_he_thong ⇒ 409 HE_THONG_CHUA_CAU_HINH; không ghi gì', async () => {
    const w = await patientRescheduleWorld(db, fx);
    const old = await w.book(0);
    await db.query('DELETE FROM cau_hinh_he_thong');
    const before = await untouchedState(db);
    const failure = await appFailure(w.reschedule(old.maLichHen, 2));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await untouchedState(db)).toEqual(before);
  });
});

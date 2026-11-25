import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import { PatientRescheduleService } from '../reschedule/patient-reschedule.service.js';
import { RescheduleDetailReader } from '../reschedule/reschedule-detail.reader.js';
import { ReschedulePreviewService } from '../reschedule/reschedule-preview.service.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import { RescheduleRequestService } from '../reschedule/reschedule-request.service.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { realRescheduleReader } from './reschedule-detail-world.js';
import {
  rescheduleServiceWorld,
  type RescheduleWorldOptions,
} from './reschedule-service-world.js';

// Hạ tầng test dùng chung của HAI ROUTE đổi lịch Bệnh nhân trên MySQL THẬT (reschedule B6; PLAN reschedule 5.8, 7.2): int-spec của `PatientRescheduleService`, của `ReschedulePreviewService` và e2e cùng dựng một
// thế giới nên MỘT chỗ ở đây, để jscpd (quét cả `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. Dựng trên `rescheduleServiceWorld` của B4 (lõi đổi lịch THẬT, `book`, `rowOf`, `expectSettled`…), cộng
// B5 THẬT (`RescheduleRequestService`), bộ đọc chi tiết THẬT (để so `choPhepDoiLich` với `choPhepDoi`), `BookingNotifier` THẬT (ghi `thong_bao` và `email_thong_bao`). Nằm trong `testing/` nên AR-01 và AR-06 bỏ qua.
// Ô i của thế giới: 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả của `useIntegrationHooks` là 02/11/2026 08:00. `soLanTuDoiLichToiDa` mặc định 2. Mọi dữ liệu là DỮ LIỆU GIẢ.

/** Lý do yêu cầu hợp lệ (5 đến 500 điểm mã). */
export const VALID_REASON = 'Tôi có việc đột xuất vào đúng giờ đã đặt';

export async function patientRescheduleWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: RescheduleWorldOptions = {},
) {
  const notifier = options.notifier ?? new BookingNotifier();
  const w = await rescheduleServiceWorld(db, fx, { ...options, notifier });
  const reader = realRescheduleReader(db, {
    leave: w.leave,
    pending: w.pending,
  });
  const repository = new RescheduleRequestRepository();
  const requests = new RescheduleRequestService(
    db,
    reader,
    repository,
    notifier,
  );
  const previewService = new ReschedulePreviewService(db, reader);
  const detailReader = new RescheduleDetailReader(reader, repository);
  const patientService = new PatientRescheduleService(w.service, requests);

  /** `POST`: đổi lịch `maLichHen` sang ô (hoặc id) `to`; `lyDoYeuCau` tuỳ chọn; mặc định tài khoản chủ lịch của thế giới. */
  const reschedule = (
    maLichHen: string,
    to: number | string,
    lyDoYeuCau?: string,
    accountId: string = w.patientId,
  ) =>
    patientService.reschedule(accountId, maLichHen, {
      khungGioId: w.slot(to),
      ...(lyDoYeuCau === undefined ? {} : { lyDoYeuCau }),
    });

  /** `GET`: xem trước đổi lịch `maLichHen`, kèm ô (hoặc id) `to` nếu có. */
  const preview = (
    maLichHen: string,
    to?: number | string,
    accountId: string = w.patientId,
  ) =>
    previewService.preview(
      accountId,
      maLichHen,
      to === undefined ? undefined : w.slot(to),
    );

  /** `choPhepDoiLich` của CHI TIẾT lịch (B5) cho cùng lịch: chuẩn để so với `choPhepDoi` của preview (HDL-25). */
  const choPhepDoiLich = (
    maLichHen: string,
    lichHenId: string,
    accountId: string = w.patientId,
  ): Promise<boolean> =>
    runReadOnly(
      db,
      async (em) =>
        (
          await detailReader.forPatient(em, {
            accountId,
            maLichHen,
            lichHenId,
            now: toSecond(nowVN()),
          })
        ).choPhepDoiLich,
    );

  /** Bệnh nhân KHÁC kèm hồ sơ người thân của họ, mỗi hồ sơ một lịch `DaXacNhan` (ô `slot` và `slot + 1`): để thử "của người khác" (DLH-09, QDL-06). */
  const otherPatient = async (slot: number) => {
    const other = await fx.admin.patient();
    const otherId = other.account.taiKhoanId;
    const relativeId = await fx.relative(otherId);
    const own = await w.book(slot, { patientId: otherId });
    const viaRelative = await w.book(slot + 1, {
      patientId: otherId,
      hoSoNguoiThanId: relativeId,
    });
    return { otherId, relativeId, own, viaRelative };
  };

  return {
    ...w,
    reader,
    requests,
    detailReader,
    /** Lõi B4 THẬT (`rescheduleServiceWorld.service`); `patientService` là dịch vụ ghép của B6 */
    core: w.service,
    patientService,
    previewService,
    reschedule,
    preview,
    choPhepDoiLich,
    otherPatient,
  };
}

export type PatientRescheduleWorld = Awaited<
  ReturnType<typeof patientRescheduleWorld>
>;

/** Bắt `AppException` của một lời gọi: trả `{ status, body }` để so (CÙNG thân 404, mã, `chiTiet`); lỗi khác ném lại. */
export async function appFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return {
      status: error.getStatus(),
      body: error.getResponse() as {
        maLoi: string;
        thongBao: string;
        chiTiet?: unknown;
        loi?: { truong: string; ma: string }[];
      },
    };
  }
  throw new Error('lẽ ra phải ném AppException');
}

/** Đặt cờ khoá đặt lịch do no-show của Bệnh nhân (DLH-22: cờ này KHÔNG chặn đổi lịch, Q7 (b)). */
export function lockNoShow(db: DataSource, patientId: string) {
  return db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
    [patientId],
  );
}

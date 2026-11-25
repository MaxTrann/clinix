import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import { ReceptionReschedulePreviewService } from '../reschedule/reception-reschedule-preview.service.js';
import { ReceptionRescheduleService } from '../reschedule/reception-reschedule.service.js';
import { RescheduleDetailReader } from '../reschedule/reschedule-detail.reader.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { dataState } from './create-appointment-world.js';
import { realRescheduleReader } from './reschedule-detail-world.js';
import {
  rescheduleServiceWorld,
  type RescheduleWorldOptions,
} from './reschedule-service-world.js';

// Hạ tầng test dùng chung của HAI ROUTE đổi lịch HỘ của Lễ tân trên MySQL THẬT (reschedule B7; PLAN reschedule 5.8, 7.3): int-spec của `ReceptionRescheduleService`, của `ReceptionReschedulePreviewService` và e2e cùng
// dựng một thế giới nên MỘT chỗ ở đây, để jscpd (quét cả `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. Dựng trên `rescheduleServiceWorld` của B4 (lõi đổi lịch THẬT, `book`, `rowOf`, `expectSettled`…), cộng
// `ReceptionScopeService` THẬT (đọc `le_tan` mỗi lần), `AuditService` THẬT (ghi `nhat_ky_hanh_dong`), `BookingNotifier` THẬT (ghi `thong_bao` và `email_thong_bao`), bộ đọc chi tiết THẬT (để so `choPhepDoiLich` với
// `choPhepDoi`). Nằm trong `testing/` nên AR-01, AR-06 và AR-08 bỏ qua. Ô i của thế giới: 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả của `useIntegrationHooks` là 02/11/2026 08:00.
// `soLanTuDoiLichToiDa` mặc định 2, `check_in_sau_phut` 15. Mọi dữ liệu là DỮ LIỆU GIẢ.

/** Lý do đổi hộ hợp lệ (1 đến 255 đơn vị UTF-16, không giống bí mật). */
export const PROXY_REASON =
  'Bệnh nhân gọi điện xin dời sang buổi chiều vì trùng lịch làm';

export interface ReceptionRescheduleWorldOptions extends RescheduleWorldOptions {
  /** `AuditService` thay thế (ca hoàn tác khi Audit lỗi); mặc định là bản THẬT */
  audit?: AuditService;
}

/** Một dòng `nhat_ky_hanh_dong` đọc ra để so (id là CHUỖI; `chiTiet` là JSON đã phân tích). */
export interface AuditRow {
  taiKhoanId: string;
  chiNhanhId: string | null;
  hanhDong: string;
  loaiDoiTuong: string;
  maDoiTuong: string;
  ketQua: string;
  chiTiet: unknown;
}

export async function receptionRescheduleWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: ReceptionRescheduleWorldOptions = {},
) {
  const notifier = options.notifier ?? new BookingNotifier();
  const w = await rescheduleServiceWorld(db, fx, { ...options, notifier });
  const reader = realRescheduleReader(db, {
    leave: w.leave,
    pending: w.pending,
  });
  const scopes = new ReceptionScopeService(new ReceptionScopeRepository(db));
  const audit = options.audit ?? new AuditService(new AuditRepository());
  const service = new ReceptionRescheduleService(scopes, w.service, audit);
  const previewService = new ReceptionReschedulePreviewService(
    db,
    scopes,
    reader,
  );
  const detailReader = new RescheduleDetailReader(
    reader,
    new RescheduleRequestRepository(),
  );
  const receptionId = w.receptionist.account.taiKhoanId;

  /** `POST`: Lễ tân đổi hộ lịch `maLichHen` sang ô (hoặc id) `to`; mặc định Lễ tân của thế giới và lý do hợp lệ. */
  const reschedule = (
    maLichHen: string,
    to: number | string,
    lyDo: string = PROXY_REASON,
    accountId: string = receptionId,
  ) =>
    service.reschedule(accountId, maLichHen, { khungGioId: w.slot(to), lyDo });

  /** `GET`: xem trước đổi hộ lịch `maLichHen`, kèm ô (hoặc id) `to` nếu có. */
  const preview = (
    maLichHen: string,
    to?: number | string,
    accountId: string = receptionId,
  ) =>
    previewService.preview(
      accountId,
      maLichHen,
      to === undefined ? undefined : w.slot(to),
    );

  /** `choPhepDoiLich` của CHI TIẾT lịch Lễ tân (B5) cho cùng lịch: chuẩn để so với `choPhepDoi` của preview (HDL-29). */
  const choPhepDoiLich = (
    maLichHen: string,
    chiNhanhId: string = w.branchId,
  ): Promise<boolean> =>
    runReadOnly(
      db,
      async (em) =>
        (
          await detailReader.forReception(em, {
            chiNhanhId,
            maLichHen,
            now: toSecond(nowVN()),
          })
        ).choPhepDoiLich,
    );

  /** Mọi dòng nhật ký theo thứ tự ghi (khẳng định "không ghi" bằng SỐ dòng so với trước, không so 0). */
  const auditRows = (): Promise<AuditRow[]> =>
    db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, hanh_dong AS hanhDong,
              loai_doi_tuong AS loaiDoiTuong, CAST(ma_doi_tuong AS CHAR) AS maDoiTuong, ket_qua AS ketQua, chi_tiet_thay_doi AS chiTiet
         FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
    );
  const auditCount = async () => (await auditRows()).length;

  /** Ảnh chụp "không được đổi gì" khi bị từ chối hay hoàn tác: dữ liệu ghi được (lịch, khung giờ, số thông báo, cờ no-show), số dòng nhật ký và số thư. Trước và sau phải BẰNG nhau. */
  const untouched = async () => ({
    data: await dataState(db),
    audit: await auditCount(),
    email: await w.countRows('email_thong_bao'),
  });

  /** Chi nhánh THỨ HAI kèm Lễ tân riêng (để thử "lịch ngoài chi nhánh" và "tài khoản Lễ tân chi nhánh khác"). */
  const otherBranch = async () => {
    const branch = await fx.admin.branch();
    const receptionist = await fx.admin.receptionist(branch);
    return {
      branch,
      branchId: branch.chiNhanhId,
      receptionId: receptionist.account.taiKhoanId,
    };
  };

  /** Lễ tân THỨ HAI của CÙNG chi nhánh (hai người đổi hộ cùng lúc). */
  const secondReceptionist = async () =>
    (await fx.admin.receptionist(w.branch)).account.taiKhoanId;

  return {
    ...w,
    reader,
    scopes,
    audit,
    service,
    previewService,
    detailReader,
    receptionId,
    reschedule,
    preview,
    choPhepDoiLich,
    auditRows,
    auditCount,
    untouched,
    otherBranch,
    secondReceptionist,
  };
}

export type ReceptionRescheduleWorld = Awaited<
  ReturnType<typeof receptionRescheduleWorld>
>;

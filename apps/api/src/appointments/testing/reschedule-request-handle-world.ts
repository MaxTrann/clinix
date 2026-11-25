import type { DataSource, EntityManager } from 'typeorm';
import type { AuditEntry } from '../../audit/audit-entry.js';
import { AuditError } from '../../audit/audit-error.js';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { BookingNotifier } from '../notifications/booking-notifier.js';
import type {
  AppointmentEvent,
  AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import { RescheduleRequestApproveService } from '../reschedule/reschedule-request-approve.service.js';
import type {
  ApproveRescheduleRequestInput,
  RejectRescheduleRequestInput,
} from '../reschedule/reschedule-request-handle.dto.js';
import { RescheduleRequestRejectService } from '../reschedule/reschedule-request-reject.service.js';
import { RescheduleRequestRepository } from '../reschedule/reschedule-request.repository.js';
import type { BookingFixtures } from './booking-fixtures.js';
import { dataState } from './create-appointment-world.js';
import { readEmails, readThongBao } from './notification-world.js';
import type { AuditRow } from './reception-reschedule-world.js';
import { readRescheduleRows } from './reschedule-notification-world.js';
import { insertRequestAt, requestRows } from './reschedule-request-world.js';
import {
  rescheduleServiceWorld,
  type RescheduleWorldOptions,
  type WorldAppointmentOptions,
} from './reschedule-service-world.js';

// Hạ tầng test dùng chung của DUYỆT và TỪ CHỐI yêu cầu đổi lịch trên MySQL THẬT (reschedule B9; PLAN reschedule 5.5, 5.7, 7.4; TRACKING reschedule 1.13): int-spec của hai dịch vụ, ca đồng thời và e2e cùng dựng một thế
// giới nên MỘT chỗ ở đây, để jscpd (quét cả `*.int-spec.ts`) không thấy cùng một khối ở nhiều file. Dựng trên `rescheduleServiceWorld` của B4 (lõi đổi lịch THẬT, `book`, `rowOf`, `expectSettled`…) cộng
// `ReceptionScopeService` THẬT (đọc `le_tan` mỗi lần), `AuditService` THẬT, `BookingNotifier` THẬT (ghi `thong_bao` và `email_thong_bao`) và `RescheduleRequestRepository` THẬT. Nằm trong `testing/` nên AR-01, AR-06
// và AR-08 bỏ qua (có SQL thẳng để dựng dữ liệu). Ô i của thế giới bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026 (thứ Ba); đồng hồ giả của `useIntegrationHooks` là 08:00 ngày 02/11/2026.
// `soLanTuDoiLichToiDa` mặc định 2, `check_in_sau_phut` 15. Mọi dữ liệu là DỮ LIỆU GIẢ.

/** Ghi chú xử lý hợp lệ (1 đến 255 đơn vị UTF-16, không giống bí mật). */
export const HANDLING_NOTE = 'Đã xếp sang khung giờ chiều cùng bác sĩ';
/** `thoi_diem_tao` của yêu cầu dựng sẵn (chuỗi giờ Việt Nam, trước đồng hồ giả 02/11/2026 08:00). */
export const REQUEST_CREATED_AT = '2026-11-01 09:00:00';
/** `thoi_diem_xu_ly` mong đợi của MỌI lần xử lý trong test: đồng hồ giả của `useIntegrationHooks` (02/11/2026 08:00 giờ Việt Nam). */
export const HANDLED_AT = '2026-11-02 08:00:00';

export interface RequestHandleWorldOptions extends RescheduleWorldOptions {
  /** `AuditService` thay thế (ca hoàn tác khi Audit lỗi); mặc định là bản THẬT */
  audit?: AuditService;
  /** Repository thay thế (ca đồng thời chặn bằng cổng); mặc định là bản THẬT */
  requests?: RescheduleRequestRepository;
}

export interface OpenRequestOptions extends WorldAppointmentOptions {
  /** Trạng thái lịch gốc; mặc định `DaXacNhan` (nối `w.book`) */
  state?: 'DaXacNhan' | 'DaHuy' | 'DaTiepDon' | 'VangMat' | 'DaDoiLich';
  /** `thoi_diem_tao` của yêu cầu; mặc định `REQUEST_CREATED_AT` */
  createdAt?: string;
}

/** Người xử lý là Quản trị viên: id tài khoản (cho `nguoi_xu_ly_id`, Audit) và phạm vi do guard sẽ giải. */
export interface AdminHandler {
  accountId: string;
  scope: AdminScope;
}

export async function requestHandleWorld(
  db: DataSource,
  fx: BookingFixtures,
  options: RequestHandleWorldOptions = {},
) {
  const notifier = options.notifier ?? new BookingNotifier();
  const w = await rescheduleServiceWorld(db, fx, { ...options, notifier });
  const scopes = new ReceptionScopeService(new ReceptionScopeRepository(db));
  const audit = options.audit ?? new AuditService(new AuditRepository());
  const requests = options.requests ?? new RescheduleRequestRepository();
  const approveService = new RescheduleRequestApproveService(
    db,
    scopes,
    requests,
    w.service,
    audit,
  );
  const rejectService = new RescheduleRequestRejectService(
    db,
    scopes,
    requests,
    audit,
    notifier,
  );
  const receptionId = w.receptionist.account.taiKhoanId;

  /** Lịch gốc ở ô `oldSlot` (mặc định `DaXacNhan` có khung giờ `DaDat`) và MỘT yêu cầu `ChoDuyet` mong muốn ô `wantedSlot` (ConTrong). Trả lịch và id yêu cầu (chuỗi). */
  const openRequest = async (
    oldSlot: number,
    wantedSlot: number | string,
    extra: OpenRequestOptions = {},
  ) => {
    const { state, createdAt, ...bookOptions } = extra;
    const lich =
      state === undefined || state === 'DaXacNhan'
        ? await w.book(oldSlot, bookOptions)
        : await fx.appointmentIn(state, {
            doctor: w.doctor,
            khungGioId: w.slot(oldSlot),
            patientId: bookOptions.patientId ?? w.patientId,
          });
    const yeuCauId = await insertRequestAt(db, {
      lichHenId: lich.lichHenId,
      khungGioMongMuonId: w.slot(wantedSlot),
      thoiDiemTao: createdAt ?? REQUEST_CREATED_AT,
    });
    return { lich, yeuCauId };
  };

  /** Quản trị viên mới: Toàn hệ thống (`all`) hay Chi nhánh của thế giới (`branch`). */
  const admin = async (kind: 'all' | 'branch'): Promise<AdminHandler> => {
    const created = await fx.admin.admin(kind === 'all' ? undefined : w.branch);
    return {
      accountId: created.account.taiKhoanId,
      scope:
        kind === 'all'
          ? { kind: 'ToanHeThong' }
          : { kind: 'ChiNhanh', chiNhanhId: w.branchId },
    };
  };

  const approve = (
    yeuCauId: string,
    input: ApproveRescheduleRequestInput = { ghiChu: HANDLING_NOTE },
    accountId: string = receptionId,
  ) => approveService.approveAsReception(accountId, yeuCauId, input);
  const reject = (
    yeuCauId: string,
    input: RejectRescheduleRequestInput = { ghiChu: HANDLING_NOTE },
    accountId: string = receptionId,
  ) => rejectService.rejectAsReception(accountId, yeuCauId, input);
  const approveAs = (
    handler: AdminHandler,
    yeuCauId: string,
    input: ApproveRescheduleRequestInput = { ghiChu: HANDLING_NOTE },
  ) =>
    approveService.approveAsAdmin(
      handler.scope,
      handler.accountId,
      yeuCauId,
      input,
    );
  const rejectAs = (
    handler: AdminHandler,
    yeuCauId: string,
    input: RejectRescheduleRequestInput = { ghiChu: HANDLING_NOTE },
  ) =>
    rejectService.rejectAsAdmin(
      handler.scope,
      handler.accountId,
      yeuCauId,
      input,
    );

  /** Hàng yêu cầu theo id (chuỗi), hoặc lỗi nếu không có. */
  const requestRow = async (yeuCauId: string) => {
    const row = (await requestRows(db)).find((r) => r.id === yeuCauId);
    if (row === undefined) throw new Error(`không có yêu cầu ${yeuCauId}`);
    return row;
  };

  /** Mọi dòng nhật ký theo thứ tự ghi (khẳng định "không ghi" bằng SỐ dòng so với trước, không so 0). */
  const auditRows = (): Promise<AuditRow[]> =>
    db.query(
      `SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, hanh_dong AS hanhDong,
              loai_doi_tuong AS loaiDoiTuong, CAST(ma_doi_tuong AS CHAR) AS maDoiTuong, ket_qua AS ketQua, chi_tiet_thay_doi AS chiTiet
         FROM nhat_ky_hanh_dong ORDER BY nhat_ky_hanh_dong_id`,
    );
  const auditCount = async () => (await auditRows()).length;

  /** Ảnh chụp "không được đổi gì" khi bị từ chối hay hoàn tác: lịch, khung giờ, số thông báo, cờ no-show, MỌI hàng yêu cầu, số dòng nhật ký và số thư. Trước và sau phải BẰNG nhau. */
  const untouched = async () => ({
    data: await dataState(db),
    requests: await requestRows(db),
    audit: await auditCount(),
    email: await w.countRows('email_thong_bao'),
  });

  /** Chi nhánh THỨ HAI kèm Lễ tân riêng (để thử "yêu cầu ngoài chi nhánh" và "Lễ tân chi nhánh khác"). */
  const otherBranch = async () => {
    const branch = await fx.admin.branch();
    const receptionist = await fx.admin.receptionist(branch);
    return {
      branch,
      branchId: branch.chiNhanhId,
      receptionId: receptionist.account.taiKhoanId,
    };
  };

  /** Lễ tân THỨ HAI của CÙNG chi nhánh (hai người xử lý cùng lúc). */
  const secondReceptionist = async () =>
    (await fx.admin.receptionist(w.branch)).account.taiKhoanId;

  return {
    ...w,
    scopes,
    audit,
    requests,
    approveService,
    rejectService,
    receptionId,
    openRequest,
    admin,
    approve,
    reject,
    approveAs,
    rejectAs,
    requestRow,
    auditRows,
    auditCount,
    thongBao: (loai?: string) => readThongBao(db, loai),
    /** Mọi thông báo kèm cột yêu cầu và trạng thái thư (B3), theo thứ tự ghi */
    notices: () => readRescheduleRows(db),
    emails: () => readEmails(db),
    untouched,
    otherBranch,
    secondReceptionist,
  };
}

export type RequestHandleWorld = Awaited<ReturnType<typeof requestHandleWorld>>;

/** Audit THẬT, nhưng ghi XONG dòng rồi ném `AuditError`: chứng minh dòng vừa ghi cũng bị hoàn tác. */
export class FlakyAudit extends AuditService {
  failing = true;
  override async record(em: EntityManager, entry: AuditEntry): Promise<void> {
    await super.record(em, entry);
    if (this.failing) throw new AuditError('AUDIT_WRITE_FAILED');
  }
}

/** Thông báo THẬT, nhưng ghi XONG rồi ném: chứng minh thông báo và thư vừa ghi cũng bị hoàn tác. */
export class FlakyNotifier implements AppointmentNotifier {
  failing = true;
  private readonly real = new BookingNotifier();
  async notify(em: EntityManager, event: AppointmentEvent): Promise<void> {
    await this.real.notify(em, event);
    if (this.failing) throw new Error('ghi thông báo lỗi');
  }
}

/**
 * Thế giới của hai e2e (TRACKING reschedule 1.13): `requestHandleWorld` cộng token của MỌI vai (`tokenOf` do e2e đưa vào, vì nó cần `RefreshHarness`): Lễ tân của chi nhánh, Lễ tân của chi nhánh KHÁC, Quản trị viên
 * Toàn hệ thống, Quản trị viên Chi nhánh, Quản trị viên của chi nhánh KHÁC, Bệnh nhân (chủ lịch) và Bác sĩ. Các dịch vụ của thế giới (`w.approve`, `w.reject`…) chỉ để dựng dữ liệu; e2e gọi dịch vụ của AppModule qua HTTP.
 */
export async function handleHttpWorld(
  db: DataSource,
  fx: BookingFixtures,
  tokenOf: (accountId: string) => Promise<string>,
  options: RequestHandleWorldOptions = {},
) {
  const w = await requestHandleWorld(db, fx, options);
  const all = await w.admin('all');
  const branch = await w.admin('branch');
  const other = await w.otherBranch();
  const otherAdmin = await fx.admin.admin(other.branch);
  const tokens = {
    reception: await tokenOf(w.receptionId),
    otherReception: await tokenOf(other.receptionId),
    all: await tokenOf(all.accountId),
    branchAdmin: await tokenOf(branch.accountId),
    otherAdmin: await tokenOf(otherAdmin.account.taiKhoanId),
    patient: await tokenOf(w.patientId),
    doctor: await tokenOf(w.doctor.taiKhoanId),
  };
  return { ...w, other, tokens };
}

export type HandleHttpWorld = Awaited<ReturnType<typeof handleHttpWorld>>;

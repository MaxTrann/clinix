import { Inject, Injectable } from '@nestjs/common';
import type { AppException } from '../../common/errors/app.exception.js';
import { nowVN } from '../../common/time/time.js';
import {
  BOOKING_ERROR_CODES,
  bookingException,
} from '../appointments.constants.js';
import { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import type { RescheduleResult } from './patient-reschedule.dto.js';
import {
  toRequestSentResult,
  toRescheduledResult,
} from './patient-reschedule.mapper.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import { normalizeRequestReason } from './reschedule-reason.js';
import { RescheduleRequestService } from './reschedule-request.service.js';
import type {
  RescheduleOutcome,
  RescheduleRejection,
} from './reschedule.types.js';

/** Kết quả của B4 khi ĐÃ loại `OverQuota` (nhánh yêu cầu xử lý riêng). */
type CoreSettled = Exclude<RescheduleOutcome, { kind: 'OverQuota' }>;

/**
 * `Rejected` của B4 hoặc B5 sang lỗi API. Hai kiểu riêng của DUYỆT (`RequestNotFound`, `RequestHandled`) chỉ có ở đường `DuyetYeuCau` của B9; ở `TuDoi` không thể xảy ra, nên là lỗi lập trình: ném `Error`
 * thường (ra 500 `LOI_HE_THONG`), KHÔNG đoán sang 404 để khỏi che lỗi.
 */
function patientRejection(rejection: RescheduleRejection): AppException {
  if (
    rejection.kind === 'RequestNotFound' ||
    rejection.kind === 'RequestHandled'
  )
    throw new Error(
      `kết quả của đường duyệt xuất hiện ở đường tự đổi: ${rejection.kind}`,
    );
  return rescheduleFailureException(rejection);
}

/**
 * `POST /patient/appointments/:maLichHen/reschedule` (reschedule B6; PLAN reschedule 5.5, 5.8; TRACKING reschedule 1.10). GHÉP hai dịch vụ đã có, KHÔNG có SQL và KHÔNG mở giao dịch (AR-06):
 *  1. `AppointmentRescheduleService.reschedule` (B4) với `actor` `TuDoi`: đổi ngay khi còn lần tự đổi, hoặc trả `OverQuota` (không khoá, không ghi gì) khi đã hết lần.
 *  2. `OverQuota`: không có `lyDoYeuCau` ⇒ 409 `VUOT_SO_LAN_TU_DOI` kèm `chiTiet { soLanDaDoi, toiDa }`; có ⇒ `RescheduleRequestService.create` (B5, giao dịch RIÊNG của B5).
 *  3. B5 trả `NotOverQuota` (cấu hình `toiDa` tăng giữa hai lần đọc) ⇒ gọi B4 lại ĐÚNG MỘT lần; vẫn `OverQuota` ⇒ 503 `HE_THONG_DANG_BAN`. B5 không bao giờ được gọi lần hai.
 * Không gói B4 và B5 vào một giao dịch: mỗi bên tự mở `withBookingTransaction` (không lồng được), nhánh `OverQuota` không giữ khoá nào, và nhánh yêu cầu chỉ khoá MỘT khung giờ (PLAN 5.4 cột "Tạo yêu cầu").
 * Lỗi mà B4 hay B5 NÉM (409 `HE_THONG_CHUA_CAU_HINH`, 503 của `withBookingTransaction`, 400 `lyDoYeuCau` của B5) đi nguyên, không nuốt. `thoiGianMayChu` lấy SAU khi B4 hay B5 đã trả (sau commit).
 * Không log: lý do, mã lịch và tên là dữ liệu cá nhân (BDL-01).
 */
@Injectable()
export class PatientRescheduleService {
  constructor(
    @Inject(AppointmentRescheduleService)
    private readonly core: AppointmentRescheduleService,
    @Inject(RescheduleRequestService)
    private readonly requests: RescheduleRequestService,
  ) {}

  /** `maLichHen` đã qua `ParseAppointmentCodePipe`; `accountId` chỉ từ access token; `lyDoYeuCau` đã chuẩn hoá ở DTO (vắng khi rỗng). */
  async reschedule(
    accountId: string,
    maLichHen: string,
    input: { khungGioId: string; lyDoYeuCau?: string },
  ): Promise<RescheduleResult> {
    const first = await this.runCore(accountId, maLichHen, input.khungGioId);
    if (first.kind !== 'OverQuota') return this.settled(first);

    // Đã hết lần tự đổi (nhánh yêu cầu): thiếu lý do (vắng, rỗng hay chỉ khoảng trắng) thì nhắc, không ghi gì. DTO đã coi rỗng là vắng; làm lại ở đây để quy tắc không phụ thuộc DTO
    const lyDoYeuCau =
      input.lyDoYeuCau === undefined
        ? ''
        : normalizeRequestReason(input.lyDoYeuCau);
    if (lyDoYeuCau === '')
      throw rescheduleFailureException({
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.OVER_SELF_RESCHEDULE_LIMIT,
        chiTiet: { soLanDaDoi: first.soLanDaDoi, toiDa: first.toiDa },
      });

    const created = await this.requests.create({
      maLichHen,
      khungGioMongMuonId: input.khungGioId,
      lyDoYeuCau,
      accountId,
    });
    switch (created.kind) {
      case 'RequestCreated':
        return toRequestSentResult(created.thoiGianMongMuon, nowVN());
      case 'Rejected':
        throw patientRejection(created.failure);
      case 'NotOverQuota': {
        // Cấu hình đổi giữa lần đọc của B4 và của B5: lịch lại còn lần tự đổi. Quay về B4 ĐÚNG MỘT lần; còn lệch nữa thì hệ thống đang bận (không vòng lặp)
        const second = await this.runCore(
          accountId,
          maLichHen,
          input.khungGioId,
        );
        if (second.kind === 'OverQuota')
          throw bookingException(BOOKING_ERROR_CODES.SYSTEM_BUSY);
        return this.settled(second);
      }
    }
  }

  private runCore(
    accountId: string,
    maLichHen: string,
    khungGioMoiId: string,
  ): Promise<RescheduleOutcome> {
    return this.core.reschedule({
      maLichHen,
      khungGioMoiId,
      actor: { via: 'TuDoi', accountId },
    });
  }

  private settled(outcome: CoreSettled): RescheduleResult {
    if (outcome.kind === 'Rejected') throw patientRejection(outcome.failure);
    return toRescheduledResult(outcome, nowVN());
  }
}

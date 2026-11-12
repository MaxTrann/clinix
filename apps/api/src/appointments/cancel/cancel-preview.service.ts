import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { canPatientCancel } from '../lists/patient-appointment.mapper.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { readCancelPreviewRow } from './cancel-preview.query.js';
import type { CancelPreview } from './patient-cancel.dto.js';
import { calculateRefund, refundPolicyOf } from './refund-calculator.js';

/**
 * `GET /patient/appointments/:maLichHen/cancel-preview` (task B10; PLAN booking 5.6 "Ước tính trước khi xác nhận", HLH b3, Q18; TRACKING 3.23 B10-G). CHỈ ĐỌC: MỘT lần `runReadOnly` (không khoá, không ghi:
 * HL-08), hàng `lich_hen` và `amountPaid` cùng ảnh chụp. Dùng cùng `calculateRefund` và cùng `canPatientCancel` (ma trận) với lần huỷ thật nên số dự kiến và số thực tế chỉ lệch khi giờ qua mốc (Q18).
 * Không log (mã lịch hẹn là dữ liệu cá nhân). Lịch của người khác, không tồn tại và `DaDoiLich` cùng ra MỘT 404 `KHONG_TIM_THAY` ném SAU khi giao dịch đã đóng (H10, QB-01).
 */
@Injectable()
export class CancelPreviewService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
  ) {}

  /** `maLichHen` đã được `ParseAppointmentCodePipe` chuẩn hoá và kiểm dạng; `patientId` chỉ từ access token. */
  async preview(patientId: string, maLichHen: string): Promise<CancelPreview> {
    const now = toSecond(nowVN());
    const preview = await runReadOnly(this.db, async (manager) => {
      const row = await readCancelPreviewRow(manager, patientId, maLichHen);
      if (row === null) return null;
      if (!canPatientCancel(row.trangThai))
        return {
          choPhepHuy: false,
          lyDoKhongHuy: BOOKING_ERROR_CODES.NOT_CANCELLABLE,
          hoanCoc: null,
        } satisfies CancelPreview;
      const daThu = await this.payments.amountPaid(manager, row.lichHenId);
      const refund = calculateRefund({
        policy: refundPolicyOf('BenhNhanHuy'),
        snapshot: row.chinhSachHoan,
        thoiGian: row.thoiGian,
        now,
        daThu,
      });
      return { choPhepHuy: true, hoanCoc: refund } satisfies CancelPreview;
    });
    if (preview === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return preview;
  }
}

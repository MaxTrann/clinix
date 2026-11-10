import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { nowVN } from '../../common/time/time.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from '../ports/payment.port.js';
import { REFUND_PORT, type RefundPort } from '../ports/wallet.port.js';
import { toDetail } from './patient-appointment.mapper.js';
import {
  PATIENT_VISIBLE_STATES,
  type PatientAppointmentDetail,
} from './patient-appointments.dto.js';
import { PatientAppointmentsRepository } from './patient-appointments.repository.js';

/**
 * Chi tiết MỘT lịch hẹn của Bệnh nhân (task B2; PLAN booking 5.9, L17, Q31; TRACKING 3.15 B2-B, B2-D). Chỉ đọc, không khoá, không log (mã lịch và lý do khám là dữ liệu
 * cá nhân). `patientId` chỉ từ access token và đi vào SQL. Mọi trường hợp không xem được (của người khác, không tồn tại, `DaDoiLich`) ra CÙNG một 404 `KHONG_TIM_THAY`
 * từ cùng một nhánh mã, sau cùng một câu SQL: không có bước nào khác nhau giữa "của người khác" và "không tồn tại" (H10, QB-01).
 */
@Injectable()
export class PatientAppointmentDetailService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientAppointmentsRepository)
    private readonly appointments: PatientAppointmentsRepository,
    @Inject(PAYMENT_SUMMARY_PORT) private readonly payments: PaymentSummaryPort,
    @Inject(REFUND_PORT) private readonly refunds: RefundPort,
  ) {}

  /** `maLichHen` đã được `ParseAppointmentCodePipe` chuẩn hoá và kiểm dạng. */
  async detail(
    patientId: string,
    maLichHen: string,
  ): Promise<PatientAppointmentDetail> {
    // MỘT lần `runReadOnly`: hàng `lich_hen` và hai cổng (bản thật đọc `giao_dich_thanh_toan`, `lich_su_hoan_tien`) cùng ảnh chụp nên trạng thái và tiền không lệch nhau
    const read = await runReadOnly(this.dataSource, async (manager) => {
      const row = await this.appointments.findDetail(
        manager,
        patientId,
        maLichHen,
        PATIENT_VISIBLE_STATES,
      );
      if (row === null) return null;
      const thanhToan = await this.payments.findPayment(manager, row.lichHenId);
      const hoanTien = await this.refunds.findRefund(manager, row.lichHenId);
      return { row, thanhToan, hoanTien };
    });
    // Ném SAU khi giao dịch đã đóng (nếp B1) và ở MỘT chỗ duy nhất cho mọi lý do "không xem được"
    if (read === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    // Giờ máy chủ lấy SAU cùng, gần lúc gửi nhất, để giao diện bù lệch đồng hồ chính xác (5.13)
    return toDetail(read.row, {
      thanhToan: read.thanhToan,
      hoanTien: read.hoanTien,
      serverTime: nowVN(),
    });
  }
}

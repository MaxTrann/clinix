import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../../common/errors/error-codes.js';
import { runReadOnly } from '../../../common/transaction/read-only-tx.js';
import type { PatientExamDetail } from './patient-exam-detail.dto.js';
import { toDetail } from './patient-exam-detail.mapper.js';
import { PatientExamDetailRepository } from './patient-exam-detail.repository.js';

/**
 * Chi tiết MỘT lịch `HoanThanh` của Bệnh nhân: hồ sơ khám và đánh giá của chính họ (doctor-exam B5; PLAN 5.6, Q6, Q18, Q19, Q21; XHS-06…XHS-10, XHS-14, XHS-19). Chỉ đọc, không khoá, không log.
 * MỘT câu trong MỘT lần gọi `runReadOnly` (READ ONLY là rào chắn thứ hai: `FOR UPDATE` lọt vào bị MySQL từ chối). `patientId` chỉ từ access token; `maLichHen` đã chuẩn hoá ở pipe.
 * Lịch của người khác, chưa `HoanThanh` hay không có ĐỀU là "không dòng" ⇒ cùng MỘT 404 `KHONG_TIM_THAY`, thân không nêu lý do (H10): không dò được lịch của người khác bằng mã.
 */
@Injectable()
export class PatientExamDetailService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientExamDetailRepository)
    private readonly repository: PatientExamDetailRepository,
  ) {}

  async detail(
    patientId: string,
    maLichHen: string,
  ): Promise<PatientExamDetail> {
    const row = await runReadOnly(this.dataSource, (manager) =>
      this.repository.findDetail(manager, patientId, maLichHen),
    );
    if (row === undefined)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return toDetail(row);
  }
}

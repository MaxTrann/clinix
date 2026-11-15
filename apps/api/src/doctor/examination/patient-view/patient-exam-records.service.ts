import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runReadOnly } from '../../../common/transaction/read-only-tx.js';
import { nowVN } from '../../../common/time/time.js';
import type {
  PatientExamRecordsPage,
  PatientExamRecordsQuery,
} from './patient-exam-records.dto.js';
import {
  toExaminee,
  toItem,
  toMonthCounts,
} from './patient-exam-records.mapper.js';
import { PatientExamRecordsRepository } from './patient-exam-records.repository.js';
import { listPeriod, resolveYear } from './patient-exam-records.rules.js';

/**
 * Danh sách hồ sơ khám của Bệnh nhân (doctor-exam B4; PLAN 5.6, Q6, Q18, Q21; XHS-01…XHS-05, XHS-08, XHS-16, XHS-17). Chỉ đọc, không khoá, không log. `patientId` chỉ từ access token và đi vào SQL của CẢ BỐN câu.
 * Bốn câu chạy trong MỘT lần gọi `runReadOnly` (một ảnh chụp, READ ONLY): `total`, `demTheoThang`, `nguoiKham` và trang khớp nhau dù có ghi đồng thời. `now` để test đặt đồng hồ (năm mặc định theo giờ VN).
 */
@Injectable()
export class PatientExamRecordsService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(PatientExamRecordsRepository)
    private readonly records: PatientExamRecordsRepository,
  ) {}

  async list(
    patientId: string,
    query: PatientExamRecordsQuery,
    now: Date = nowVN(),
  ): Promise<PatientExamRecordsPage> {
    const nam = resolveYear(query.nam, now);
    const period = listPeriod(nam, query.thang);
    const examinee = query.nguoiKham ?? null;
    return runReadOnly(this.dataSource, async (manager) => {
      const total = await this.records.count(
        manager,
        patientId,
        examinee,
        period,
      );
      // `demTheoThang`: áp người khám và cả năm, KHÔNG áp `thang`
      const months = await this.records.countByMonth(
        manager,
        patientId,
        examinee,
        nam,
      );
      const options = await this.records.findExaminees(manager, patientId);
      // Chỉ lấy trang khi `offset < total`: `page` rất lớn không bao giờ gửi `OFFSET` khổng lồ cho MySQL (1064 ra 500)
      const rows =
        query.offset < total
          ? await this.records.findPage(
              manager,
              patientId,
              examinee,
              period,
              query.pageSize,
              query.offset,
            )
          : [];
      return {
        items: rows.map(toItem),
        total,
        page: query.page,
        pageSize: query.pageSize,
        demTheoThang: toMonthCounts(months),
        nguoiKham: options.map(toExaminee),
      };
    });
  }
}

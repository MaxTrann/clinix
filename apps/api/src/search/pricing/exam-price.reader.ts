import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import type { ChucDanhBacSi } from '../../admin/entities/enums.js';
import {
  computeExamPrice,
  computeSurcharge,
  type DoctorForPricing,
  type SurchargeRule,
} from '../../pricing/surcharge.calculator.js';

/** Giá khám áp dụng của một bác sĩ: chuỗi decimal như DB (ví dụ "350000.00"). */
export interface ExamPrice {
  phuPhi: string;
  giaKham: string;
}

type RuleRow = {
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiemTu: number;
  phuPhi: string;
  apDung: number | boolean;
};

/**
 * Đọc MỌI quy tắc phụ phí một lần rồi tính giá cho từng ứng viên (PLAN search 5.4, Q15).
 * Reader này KHÔNG có công thức riêng (H3): mọi phép tính đi qua `computeSurcharge` / `computeExamPrice`
 * của `apps/api/src/pricing/`, dùng chung với admin và booking.
 */
@Injectable()
export class ExamPriceReader {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  /** Toàn bộ dòng `phu_phi_bac_si` (kể cả `ap_dung = false`: hàm chung tự loại). Truyền `manager` để dùng chung giao dịch chỉ đọc. */
  async loadRules(manager?: EntityManager): Promise<SurchargeRule[]> {
    const rows = await (manager ?? this.db.manager).query<RuleRow[]>(
      `SELECT chuc_danh AS chucDanh, so_nam_kinh_nghiem_tu AS soNamKinhNghiemTu,
              phu_phi AS phuPhi, ap_dung AS apDung
       FROM phu_phi_bac_si`,
    );
    return rows.map((row) => ({
      chucDanh: row.chucDanh,
      soNamKinhNghiemTu: Number(row.soNamKinhNghiemTu),
      phuPhi: String(row.phuPhi),
      // MySQL trả tinyint 0/1.
      apDung: Boolean(row.apDung),
    }));
  }

  /** Giá áp dụng = giá mặc định của dịch vụ + phụ phí hiện hành, cả hai lấy từ hàm chung. */
  priceFor(
    giaMacDinh: string,
    rules: readonly SurchargeRule[],
    doctor: DoctorForPricing,
  ): ExamPrice {
    return {
      phuPhi: computeSurcharge(rules, doctor),
      giaKham: computeExamPrice(giaMacDinh, rules, doctor),
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ViNoiBo } from '../entities/vi-noi-bo.entity.js';

// Truy vấn bảng `vi_noi_bo` cho xác minh OTP đăng ký (task A6). Chỉ chứa câu lệnh; chạy trong GIAO DỊCH của người gọi (`em`).
// Nạp, rút, giữ tiền là việc của module wallet, không nằm ở đây.
@Injectable()
export class ViNoiBoRepository {
  /**
   * Tạo ví nội bộ rỗng (số dư 0, đang giữ 0) cho Bệnh nhân vừa có hồ sơ (Q9), cùng giao dịch với `benh_nhan`. Mỗi Bệnh nhân đúng một ví:
   * `benh_nhan_id` UNIQUE nên tạo lần hai ném 1062 (dữ liệu hỏng), người gọi hoàn tác cả giao dịch. decimal là chuỗi để không mất độ chính xác.
   */
  async insertEmpty(em: EntityManager, benhNhanId: string): Promise<void> {
    await em.insert(ViNoiBo, {
      benhNhanId,
      soDu: '0.00',
      soTienDangGiu: '0.00',
    });
  }
}

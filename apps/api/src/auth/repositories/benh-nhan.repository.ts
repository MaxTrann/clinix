import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { BenhNhan } from '../entities/benh-nhan.entity.js';

// Truy vấn bảng `benh_nhan` cho xác minh OTP đăng ký (task A6). Chỉ chứa câu lệnh; chạy trong GIAO DỊCH của người gọi (`em`).
@Injectable()
export class BenhNhanRepository {
  /**
   * Tạo hồ sơ Bệnh nhân cho tài khoản vừa xác minh (quy tắc nghiệp vụ 7: dòng này chỉ có SAU khi OTP đăng ký đúng). Trùng khoá chính
   * ⇒ MySQL ném 1062 (dòng đã có dù tài khoản chưa xác minh = dữ liệu hỏng), để người gọi hoàn tác cả giao dịch. Không có cột nào
   * nullable; hai cột mặc định được ghi TƯỜNG MINH (không dựa vào DEFAULT của DB) cho khớp mô tả "chưa bị khoá, chưa no-show".
   */
  async insertNew(em: EntityManager, taiKhoanId: string): Promise<void> {
    await em.insert(BenhNhan, {
      taiKhoanId,
      khoaDatLichDoNoShow: false,
      soLanNoShow: 0,
    });
  }
}

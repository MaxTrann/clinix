import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { DoctorListDto } from './doctor.dto.js';
import { DoctorRepository } from './doctor.repository.js';

// Hồ sơ bác sĩ, phần đọc (admin B12; PLAN admin 5.2, 5.3, Q40). Phạm vi kiểm ở backend, không dựa vào việc ẩn nút ở giao diện.
@Injectable()
export class DoctorService {
  constructor(
    @Inject(DoctorRepository) private readonly doctors: DoctorRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  // `async` để lỗi kiểm trang cũng trả qua promise bị từ chối như lỗi từ DB (người gọi chỉ cần một kiểu xử lý)
  async list(scope: AdminScope, input: DoctorListDto) {
    // `page` rất lớn làm OFFSET vượt số nguyên an toàn: chặn trước khi chạm DB (như danh sách chi nhánh B7)
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    // Quản trị viên Chi nhánh: luôn chi nhánh của mình, bỏ qua `chiNhanhId` gửi lên; Toàn hệ thống: lọc theo `chiNhanhId` nếu có
    return this.doctors.list(
      input,
      this.policy.branchFilter(scope, input.chiNhanhId),
    );
  }

  /** Không có, ngoài phạm vi, hay id không phải bác sĩ đều là 404 `KHONG_TIM_THAY` (Q40: không tiết lộ bác sĩ có tồn tại ở chi nhánh khác). */
  async get(scope: AdminScope, id: string) {
    const doctor = await this.doctors.get(id, this.policy.branchFilter(scope));
    if (!doctor) throw new AppException(404, 'KHONG_TIM_THAY');
    return doctor;
  }
}

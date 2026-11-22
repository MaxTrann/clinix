import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { todayVN } from '../../common/time/time.js';
import { isDeadlockError } from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { capped } from '../branches/branch.service.js';
import { isCompatibleTitleDegree } from '../staff-accounts/staff-account-rules.js';
import {
  invalidBranch,
  invalidSpecialty,
  serviceNotAtBranch,
  titleDegreeMismatch,
} from '../staff-accounts/staff-account.errors.js';
import type { UpdateDoctorProfileDto } from './doctor.dto.js';
import { DoctorRepository, type DoctorDetail } from './doctor.repository.js';
import {
  DoctorUpdateRepository,
  type DoctorProfileValues,
  type LockedDoctor,
} from './doctor-update.repository.js';

// Sửa hồ sơ bác sĩ (admin B13; PLAN admin 5.7; BS b3–b5, A1–A3; Q17, Q18, Q19, Q20, Q39, Q40). Kiểm HẾT rồi mới ghi, nên lỗi nào cũng không lưu gì (BS-04, BS-21, BS-32).
// Quy tắc chức danh–học vị, số năm kinh nghiệm và mã lỗi dữ liệu dùng lại của tạo nhân sự B15 (`staff-accounts/`, chỉ import): một nơi định nghĩa duy nhất.

/** 409 khi đổi chi nhánh mà còn lịch hẹn hoạt động hay ca từ hôm nay ở chi nhánh hiện tại (BS A2; PLAN 5.9). */
export const BRANCH_CHANGE_BLOCKED = 'DOI_CHI_NHANH_BI_CHAN';
/** 409 khi chỉ đổi dịch vụ khám chính mà còn lịch hay ca như trên (Q17; Trung chốt mã riêng 22/11/2026). */
export const SERVICE_CHANGE_BLOCKED = 'DOI_DICH_VU_CHINH_BI_CHAN';
/** Số lần chạy cả giao dịch khi MySQL báo deadlock (cùng số với sửa chi nhánh B8) */
const MAX_ATTEMPTS = 3;

type Field = keyof DoctorProfileValues;
const FIELDS: readonly Field[] = [
  'chiNhanhId',
  'chuyenKhoaId',
  'dichVuKhamId',
  'chucDanh',
  'hocVi',
  'soNamKinhNghiem',
  'moTaChuyenMon',
];

@Injectable()
export class DoctorUpdateService {
  private readonly logger = new Logger(DoctorUpdateService.name);

  constructor(
    @Inject(DoctorUpdateRepository)
    private readonly writer: DoctorUpdateRepository,
    @Inject(DoctorRepository) private readonly reader: DoctorRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * MỘT giao dịch, thứ tự: khoá `bac_si` → phạm vi (404) → so form (400 không đổi) → quyền đổi chi nhánh (403) → khoá chi nhánh đích → chuyên khoa (nếu đổi)
   * → dịch vụ ở chi nhánh đích → danh sách chặn (409) → ghi → audit `DoiChiNhanhBacSi` (chỉ khi đổi chi nhánh). Trả hồ sơ đọc lại sau commit (giá mới: BS-45).
   */
  async update(
    scope: AdminScope,
    actorId: string,
    id: string,
    input: UpdateDoctorProfileDto,
  ): Promise<DoctorDetail> {
    // Hàm thuần, không cần DB: kiểm trước để khỏi mở giao dịch vô ích (BS-06)
    if (!isCompatibleTitleDegree(input.chucDanh, input.hocVi))
      throw titleDegreeMismatch();

    await this.withDeadlockRetry(() =>
      this.writer.transaction(async (manager) => {
        const current = await this.writer.lockDoctor(manager, id);
        // Q40: không có, không phải bác sĩ, hay ngoài chi nhánh của Quản trị viên Chi nhánh đều là cùng một 404 (BS-33, BS-40)
        if (!current || !this.policy.canAccessBranch(scope, current.chiNhanhId))
          throw new AppException(404, 'KHONG_TIM_THAY');
        const next = this.nextValues(current, input);
        const changed = FIELDS.filter((f) => next[f] !== current[f]);
        if (changed.length === 0)
          throw new AppException(400, 'KHONG_CO_THAY_DOI');
        const branchChanged = changed.includes('chiNhanhId');
        const serviceChanged = changed.includes('dichVuKhamId');
        // A3: chỉ Toàn hệ thống đổi chi nhánh; gửi đúng chi nhánh hiện tại thì không phải "đổi" (BS-32, BS-35)
        if (branchChanged) this.policy.assertToanHeThong(scope);

        await this.assertReferences(manager, next, {
          specialtyChanged: changed.includes('chuyenKhoaId'),
          needServiceCheck: branchChanged || serviceChanged,
        });
        if (branchChanged || serviceChanged)
          await this.assertNotBlocked(manager, current, branchChanged);

        await this.writer.update(manager, id, next);
        if (branchChanged)
          await this.audit.record(manager, {
            actorId,
            branchId: next.chiNhanhId,
            action: 'DoiChiNhanhBacSi',
            targetType: 'tai_khoan',
            targetId: id,
            result: 'ThanhCong',
            changes: {
              truoc: { chi_nhanh_id: current.chiNhanhId },
              sau: { chi_nhanh_id: next.chiNhanhId },
            },
          });
      }),
    );

    const saved = await this.reader.get(id, undefined);
    if (!saved) throw new Error('Bác sĩ vừa sửa không còn');
    return saved;
  }

  /** Mô tả: bỏ trường thì giữ nguyên; `null` (kể cả chuỗi chỉ khoảng trắng, DTO đã đổi) thì xoá. */
  private nextValues(
    current: LockedDoctor,
    input: UpdateDoctorProfileDto,
  ): DoctorProfileValues {
    return {
      chiNhanhId: input.chiNhanhId,
      chuyenKhoaId: input.chuyenKhoaId,
      dichVuKhamId: input.dichVuKhamId,
      chucDanh: input.chucDanh,
      hocVi: input.hocVi,
      soNamKinhNghiem: input.soNamKinhNghiem,
      moTaChuyenMon:
        input.moTaChuyenMon === undefined
          ? current.moTaChuyenMon
          : input.moTaChuyenMon,
    };
  }

  /** Khoá và kiểm tham chiếu theo đúng thứ tự khoá (xem `doctor-update.repository.ts`). */
  private async assertReferences(
    manager: EntityManager,
    next: DoctorProfileValues,
    opts: { specialtyChanged: boolean; needServiceCheck: boolean },
  ): Promise<void> {
    if (!(await this.writer.lockBranchShared(manager, next.chiNhanhId)))
      throw invalidBranch();
    // Q19: chỉ GÁN MỚI chuyên khoa đang hoạt động; giữ nguyên chuyên khoa đã ngừng thì vẫn sửa được trường khác (BS-10)
    if (
      opts.specialtyChanged &&
      !(await this.writer.lockActiveSpecialty(manager, next.chuyenKhoaId))
    )
      throw invalidSpecialty();
    // Không đổi chi nhánh lẫn dịch vụ thì cặp đang dùng vẫn còn: B8 chặn bỏ dịch vụ còn bác sĩ dùng (Q8)
    if (
      opts.needServiceCheck &&
      !(await this.writer.lockServiceAtBranch(
        manager,
        next.chiNhanhId,
        next.dichVuKhamId,
      ))
    )
      throw serviceNotAtBranch();
  }

  /** BS A2, Q17, Q18: danh sách ở chi nhánh HIỆN TẠI, cắt 50 dòng kèm tổng; cả hai loại cùng có trong phản hồi (BS-30). */
  private async assertNotBlocked(
    manager: EntityManager,
    current: LockedDoctor,
    branchChanged: boolean,
  ): Promise<void> {
    const { lichHen, ca } = await this.writer.blockers(
      manager,
      current.taiKhoanId,
      current.chiNhanhId,
      todayVN(),
    );
    if (lichHen.length === 0 && ca.length === 0) return;
    throw new AppException(
      409,
      branchChanged ? BRANCH_CHANGE_BLOCKED : SERVICE_CHANGE_BLOCKED,
      { chiTiet: { lichHen: capped(lichHen), ca: capped(ca) } },
    );
  }

  /** Làm lại CẢ giao dịch khi deadlock 1213 (lường trước với B8, booking, phân công ca); lỗi nghiệp vụ không bao giờ chạy lại. */
  private async withDeadlockRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await work();
      } catch (error) {
        if (!isDeadlockError(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(
          `Sửa hồ sơ bác sĩ: deadlock (1213) lần ${String(attempt)}/${String(MAX_ATTEMPTS)}, làm lại cả giao dịch`,
        );
      }
    }
  }
}

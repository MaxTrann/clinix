import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  isDeadlockError,
  isDuplicateKeyError,
} from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  normalizeBranchAddress,
  normalizeBranchName,
  type BranchListDto,
  type CreateBranchDto,
  type UpdateBranchDto,
} from './branch.dto.js';
import { BranchRepository, type BranchView } from './branch.repository.js';
import {
  diffBranch,
  isEmptyDiff,
  toRequestRow,
  touchesSchedule,
  type BranchDiff,
  type InfoField,
} from './impact/branch-diff.js';
import {
  BranchImpactService,
  type AffectedAppointment,
  type AffectedShift,
  type BranchImpact,
  type FreeSlotOutside,
} from './impact/branch-impact.service.js';
import { validateWeeklySchedule } from './weekly-schedule.validator.js';

/** Danh sách dài cắt còn tối đa 50 dòng, kèm tổng số (như danh sách chặn của hồ sơ bác sĩ, PLAN 5.7). */
export const IMPACT_LIST_LIMIT = 50;
export interface Capped<T> {
  items: T[];
  tong: number;
}
// Export để chi tiết yêu cầu thay đổi (B9) cắt danh sách ảnh hưởng theo cùng một giới hạn
export const capped = <T>(items: readonly T[]): Capped<T> => ({
  items: items.slice(0, IMPACT_LIST_LIMIT),
  tong: items.length,
});

export type SavedPart = InfoField | 'lichHoatDong' | 'dichVuKham';

/** Phản hồi của `PATCH /admin/branches/:id` [đề xuất]: nêu rõ phần ĐÃ LƯU và phần ĐANG CHỜ DUYỆT (Q2). */
export interface BranchUpdateResult {
  chiNhanh: BranchView;
  daLuu: SavedPart[];
  yeuCau: null | {
    yeuCauThayDoiChiNhanhId: string;
    trangThai: 'ChoDuyet';
    thuThayDoi: number[];
    dichVuThem: string[];
    dichVuBo: string[];
  };
  anhHuong: {
    lichHen: Capped<AffectedAppointment>;
    ca: Capped<AffectedShift>;
  };
  canhBao: { khungGioTrongNgoaiLich: Capped<FreeSlotOutside> };
}

const NO_IMPACT: BranchImpact = { lichHen: [], ca: [], khungGioTrong: [] };
/** Số lần chạy cả giao dịch sửa chi nhánh khi gặp deadlock (cùng số với các luồng ghi khác của admin) */
const MAX_ATTEMPTS = 3;

@Injectable()
export class BranchService {
  private readonly logger = new Logger(BranchService.name);

  constructor(
    @Inject(BranchRepository) private readonly branches: BranchRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    // Giá trị mặc định để các test cũ dựng `new BranchService(repo, policy)` vẫn chạy; Nest vẫn tiêm qua `@Inject`
    @Inject(BranchImpactService)
    private readonly impact: BranchImpactService = new BranchImpactService(),
  ) {}

  list(scope: AdminScope, input: BranchListDto) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    return this.branches.list(input, this.policy.branchFilter(scope));
  }

  async get(scope: AdminScope, id: string) {
    const branch = await this.branches.get(id, this.policy.branchFilter(scope));
    if (!branch) throw new AppException(404, 'KHONG_TIM_THAY');
    return branch;
  }

  create(scope: AdminScope, input: CreateBranchDto) {
    this.policy.assertToanHeThong(scope);
    this.assertCoordinatePair(input);
    const scheduleIssues = validateWeeklySchedule(input.lichHoatDong);
    if (scheduleIssues.length > 0)
      throw new AppException(400, 'LICH_HOAT_DONG_KHONG_HOP_LE', {
        chiTiet: scheduleIssues,
      });
    const serviceIds = [...new Set(input.dichVuKhamIds)];
    const normalizedInput: CreateBranchDto = {
      ten: normalizeBranchName(input.ten),
      diaChi: normalizeBranchAddress(input.diaChi),
      toaDoLat: input.toaDoLat,
      toaDoLng: input.toaDoLng,
      lichHoatDong: input.lichHoatDong,
      dichVuKhamIds: input.dichVuKhamIds,
    };
    return this.branches.transaction(async (manager) => {
      const existingIds = new Set(
        await this.branches.serviceIdsExist(manager, serviceIds),
      );
      if (serviceIds.some((id) => !existingIds.has(id)))
        throw new AppException(404, 'KHONG_TIM_THAY');
      return this.branches.create(manager, normalizedInput, serviceIds);
    });
  }

  /**
   * Sửa chi nhánh (admin B8; PLAN 5.4; Q2, Q3, Q7, Q8; quy tắc 30, 43). MỘT giao dịch, thứ tự:
   * khoá `chi_nhanh` → phạm vi (404) → so form → Q3 → Q8 → khoá khung giờ các thứ đổi → tính ảnh hưởng → ghi.
   * Không ảnh hưởng lịch hẹn và ca ⇒ áp dụng ngay; có ⇒ thông tin áp dụng ngay, lịch và dịch vụ vào MỘT yêu cầu `ChoDuyet`.
   * Lỗi nghiệp vụ ném TRONG giao dịch nên không lưu gì (kể cả phần thông tin: TRACKING 9B.3, Trung chốt "từ chối cả form").
   */
  async update(
    scope: AdminScope,
    actorId: string,
    id: string,
    input: UpdateBranchDto,
  ): Promise<BranchUpdateResult> {
    this.assertCoordinatePair(input);
    const scheduleIssues = validateWeeklySchedule(input.lichHoatDong);
    if (scheduleIssues.length > 0)
      throw new AppException(400, 'LICH_HOAT_DONG_KHONG_HOP_LE', {
        chiTiet: scheduleIssues,
      });
    const form = {
      ten: normalizeBranchName(input.ten),
      diaChi: normalizeBranchAddress(input.diaChi),
      toaDoLat: input.toaDoLat,
      toaDoLng: input.toaDoLng,
      lichHoatDong: input.lichHoatDong,
      dichVuKhamIds: [...new Set(input.dichVuKhamIds)],
    };

    return this.withDeadlockRetry(() =>
      this.branches.transaction(async (manager) => {
        const current = await this.branches.lockForUpdate(
          manager,
          id,
          this.policy.branchFilter(scope),
        );
        if (!current) throw new AppException(404, 'KHONG_TIM_THAY');
        const diff = diffBranch(current, form);
        if (isEmptyDiff(diff)) throw new AppException(400, 'KHONG_CO_THAY_DOI');

        const now = toSecond(nowVN());
        let impact = NO_IMPACT;
        if (touchesSchedule(diff)) {
          await this.assertScheduleChangeAllowed(manager, id, diff);
          // Khoá khung giờ các thứ đổi TRƯỚC khi đọc lịch hẹn (chống chạy đua với booking, CNB-01)
          await this.impact.lockSlotsOfDays(
            manager,
            id,
            now,
            diff.changedDays.map((day) => day.after.thuTrongTuan),
          );
          impact = await this.impact.compute(manager, {
            chiNhanhId: id,
            tuLuc: now,
            changedDays: diff.changedDays.map((day) => day.after),
            removedServiceIds: diff.removedServiceIds,
          });
        }

        // Q2: tên, địa chỉ, toạ độ luôn áp dụng ngay (không ảnh hưởng lịch hẹn)
        const daLuu: SavedPart[] = [...diff.infoFields];
        if (diff.infoFields.length > 0)
          await this.branches.updateInfo(manager, id, form);

        let yeuCau: BranchUpdateResult['yeuCau'] = null;
        const hasImpact = impact.lichHen.length > 0 || impact.ca.length > 0;
        if (touchesSchedule(diff) && !hasImpact) {
          await this.applySchedule(manager, id, diff);
          if (diff.changedDays.length > 0) daLuu.push('lichHoatDong');
          if (diff.addedServiceIds.length + diff.removedServiceIds.length > 0)
            daLuu.push('dichVuKham');
        } else if (hasImpact) {
          yeuCau = await this.createRequest(manager, id, actorId, diff, now);
        }

        const chiNhanh = await this.branches.getInTransaction(manager, id);
        if (!chiNhanh)
          throw new Error('Chi nhánh vừa sửa không còn trong giao dịch');
        return {
          chiNhanh,
          daLuu,
          yeuCau,
          anhHuong: { lichHen: capped(impact.lichHen), ca: capped(impact.ca) },
          canhBao: { khungGioTrongNgoaiLich: capped(impact.khungGioTrong) },
        };
      }),
    );
  }

  /**
   * Làm lại CẢ giao dịch khi MySQL báo deadlock (1213). Deadlock có thật với booking (CNB-01): B8 giữ `chi_nhanh` FOR UPDATE rồi chờ `khung_gio`,
   * còn booking giữ `khung_gio` rồi chèn `lich_hen` nên khoá ngoại xin khoá S trên chính hàng `chi_nhanh`. MySQL huỷ một bên; chạy lại thì bên kia đã
   * commit: B8 thấy lịch hẹn mới (tạo yêu cầu), hoặc booking thấy lịch mới (từ chối đặt). Lỗi nghiệp vụ (AppException) không bao giờ được chạy lại.
   */
  private async withDeadlockRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await work();
      } catch (error) {
        if (!isDeadlockError(error) || attempt >= MAX_ATTEMPTS) throw error;
        this.logger.warn(
          `Sửa chi nhánh: deadlock (1213) lần ${String(attempt)}/${String(MAX_ATTEMPTS)}, làm lại cả giao dịch`,
        );
      }
    }
  }

  /** Q3 (yêu cầu đang mở chặn mọi thay đổi lịch và dịch vụ), dịch vụ thêm phải tồn tại, Q8 (bỏ dịch vụ còn bác sĩ dùng). */
  private async assertScheduleChangeAllowed(
    manager: EntityManager,
    id: string,
    diff: BranchDiff,
  ): Promise<void> {
    if (await this.branches.hasOpenRequest(manager, id))
      throw new AppException(409, 'YEU_CAU_DANG_CHO');
    const existing = new Set(
      await this.branches.serviceIdsExist(manager, diff.addedServiceIds),
    );
    if (diff.addedServiceIds.some((serviceId) => !existing.has(serviceId)))
      throw new AppException(404, 'KHONG_TIM_THAY');
    const doctors = await this.branches.doctorsUsingServices(
      manager,
      id,
      diff.removedServiceIds,
    );
    if (doctors.length > 0)
      throw new AppException(409, 'DICH_VU_CON_BAC_SI', {
        chiTiet: { bacSi: doctors },
      });
  }

  private async applySchedule(
    manager: EntityManager,
    id: string,
    diff: BranchDiff,
  ): Promise<void> {
    for (const day of diff.changedDays)
      await this.branches.replaceScheduleRow(manager, id, day.after);
    await this.branches.removeServices(manager, id, diff.removedServiceIds);
    await this.branches.addServices(manager, id, diff.addedServiceIds);
  }

  /** Yêu cầu `ChoDuyet`: JSON chỉ gồm các thứ đổi (đủ 6 khóa) và, nếu dịch vụ đổi, danh sách dịch vụ đầy đủ trước và sau (quy tắc 43). */
  private async createRequest(
    manager: EntityManager,
    id: string,
    actorId: string,
    diff: BranchDiff,
    now: Date,
  ): Promise<NonNullable<BranchUpdateResult['yeuCau']>> {
    const servicesChanged =
      diff.addedServiceIds.length + diff.removedServiceIds.length > 0;
    const part = (side: 'before' | 'after') => ({
      ...(diff.changedDays.length > 0 && {
        lich_hoat_dong: diff.changedDays.map((day) => toRequestRow(day[side])),
      }),
      ...(servicesChanged && {
        dich_vu_kham_ids:
          side === 'before' ? diff.currentServiceIds : diff.newServiceIds,
      }),
    });
    let yeuCauId: string;
    try {
      yeuCauId = await this.branches.insertChangeRequest(manager, {
        chiNhanhId: id,
        nguoiDeXuatId: actorId,
        noiDungTruoc: part('before'),
        noiDungSau: part('after'),
        thoiDiemTao: now,
      });
    } catch (error) {
      // Cột sinh UNIQUE `dang_mo_chi_nhanh` bắt trường hợp hai yêu cầu cùng lúc (Q47, CN-45): trả mã nghiệp vụ, không 500
      if (isDuplicateKeyError(error))
        throw new AppException(409, 'YEU_CAU_DANG_CHO');
      throw error;
    }
    return {
      yeuCauThayDoiChiNhanhId: yeuCauId,
      trangThai: 'ChoDuyet',
      thuThayDoi: diff.changedDays.map((day) => day.after.thuTrongTuan),
      dichVuThem: diff.addedServiceIds,
      dichVuBo: diff.removedServiceIds,
    };
  }

  private assertCoordinatePair(input: CreateBranchDto): void {
    const hasLatitude = input.toaDoLat !== undefined;
    const hasLongitude = input.toaDoLng !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          {
            truong: hasLatitude ? 'toaDoLng' : 'toaDoLat',
            ma: 'TOA_DO_PHAI_DI_THEO_CAP',
          },
        ],
      });
    }
  }
}

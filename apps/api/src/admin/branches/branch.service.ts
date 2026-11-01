import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  normalizeBranchAddress,
  normalizeBranchName,
  type BranchListDto,
  type CreateBranchDto,
} from './branch.dto.js';
import { BranchRepository } from './branch.repository.js';
import { validateWeeklySchedule } from './weekly-schedule.validator.js';

@Injectable()
export class BranchService {
  constructor(
    @Inject(BranchRepository) private readonly branches: BranchRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
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

import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  normalizeGroupName,
  type CreateServiceGroupDto,
  type UpdateServiceGroupDto,
  type ServiceGroupListDto,
} from './service-group.dto.js';
import { ServiceGroupRepository } from './service-group.repository.js';

const duplicateName = () =>
  new AppException(409, 'TEN_NHOM_DICH_VU_TRUNG', {
    thongBao: 'Tên nhóm dịch vụ đã tồn tại.',
  });
const groupNotEmpty = () =>
  new AppException(409, 'NHOM_DICH_VU_CON_DICH_VU', {
    thongBao: 'Nhóm còn dịch vụ nên không xoá được.',
  });

@Injectable()
export class ServiceGroupService {
  constructor(
    @Inject(ServiceGroupRepository)
    private readonly groups: ServiceGroupRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  list(_scope: AdminScope, input: ServiceGroupListDto) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    return this.groups.list(input);
  }

  create(scope: AdminScope, input: CreateServiceGroupDto) {
    this.policy.assertToanHeThong(scope);
    return this.write(async (manager) => {
      const name = normalizeGroupName(input.ten);
      if (await this.groups.nameExists(manager, name)) throw duplicateName();
      return this.groups.create(manager, name, input.thuTuHienThi ?? 0);
    });
  }

  update(scope: AdminScope, id: string, input: UpdateServiceGroupDto) {
    this.policy.assertToanHeThong(scope);
    if (input.ten === undefined && input.thuTuHienThi === undefined)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE');
    return this.write(async (manager) => {
      await this.lockOrThrow(manager, id);
      const name =
        input.ten === undefined ? undefined : normalizeGroupName(input.ten);
      if (
        name !== undefined &&
        (await this.groups.nameExists(manager, name, id))
      )
        throw duplicateName();
      return this.groups.update(manager, id, {
        ten: name,
        thuTuHienThi: input.thuTuHienThi,
      });
    });
  }

  remove(scope: AdminScope, id: string) {
    this.policy.assertToanHeThong(scope);
    return this.write(async (manager) => {
      // Khóa cha trước: INSERT/đổi FK của dịch vụ phải chờ; FK vẫn là chốt bảo vệ cuối.
      await this.lockOrThrow(manager, id);
      if (await this.groups.hasServices(manager, id)) throw groupNotEmpty();
      try {
        await this.groups.remove(manager, id);
      } catch (error) {
        if (error instanceof QueryFailedError) {
          const driver = error.driverError as {
            code?: string;
            sqlMessage?: string;
          };
          if (
            driver.code === 'ER_ROW_IS_REFERENCED_2' &&
            /`dich_vu_kham`/.test(driver.sqlMessage ?? '') &&
            /FOREIGN KEY \(`nhom_dich_vu_id`\) REFERENCES `nhom_dich_vu`/.test(
              driver.sqlMessage ?? '',
            )
          )
            throw groupNotEmpty();
        }
        throw error;
      }
    });
  }

  private async lockOrThrow(manager: EntityManager, id: string) {
    if (!(await this.groups.lock(manager, id)))
      throw new AppException(404, 'KHONG_TIM_THAY');
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.groups.transaction(work);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driver = error.driverError as {
          code?: string;
          sqlMessage?: string;
        };
        if (
          driver.code === 'ER_DUP_ENTRY' &&
          /for key ['`](?:nhom_dich_vu\.)?ten['`]/.test(driver.sqlMessage ?? '')
        )
          throw duplicateName();
      }
      throw error;
    }
  }
}

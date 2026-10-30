import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { UploadRepository } from '../../common/upload/upload.repository.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  normalizeSpecialtyName,
  SpecialtyListDto,
  type SpecialtySearchDto,
  type CreateSpecialtyDto,
  type UpdateSpecialtyDto,
  type SpecialtyStatusDto,
} from './specialty.dto.js';
import { SpecialtyRepository } from './specialty.repository.js';

const duplicateName = () => new AppException(409, 'TEN_CHUYEN_KHOA_TRUNG');

@Injectable()
export class SpecialtyService {
  constructor(
    @Inject(SpecialtyRepository)
    private readonly specialties: SpecialtyRepository,
    @Inject(UploadRepository) private readonly images: UploadRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  list(_scope: AdminScope, input: SpecialtyListDto) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    // Danh mục dùng chung; không áp bộ lọc chi nhánh lên chuyên khoa hoặc số bác sĩ.
    return this.specialties.list(input);
  }

  async options(scope: AdminScope, input: SpecialtySearchDto) {
    const page = await this.list(
      scope,
      Object.assign(new SpecialtyListDto(), input, {
        trangThaiHoatDong: 'DangHoatDong' as const,
      }),
    );
    return {
      ...page,
      items: page.items.map(({ chuyenKhoaId, ten }) => ({ chuyenKhoaId, ten })),
    };
  }

  async get(_scope: AdminScope, id: string) {
    return this.readOrThrow(id);
  }

  create(scope: AdminScope, accountId: string, input: CreateSpecialtyDto) {
    this.policy.assertToanHeThong(scope);
    return this.write(async (manager) => {
      const name = normalizeSpecialtyName(input.ten);
      if (await this.specialties.nameExists(manager, name))
        throw duplicateName();
      const id = await this.specialties.create(
        manager,
        name,
        input.moTa || null,
      );
      await this.images.assignSpecialty(
        manager,
        id,
        accountId,
        input.imageUploadId,
        new Date(),
      );
      return this.readOrThrow(id, manager);
    });
  }

  update(
    scope: AdminScope,
    accountId: string,
    id: string,
    input: UpdateSpecialtyDto,
  ) {
    this.policy.assertToanHeThong(scope);
    if (
      input.ten === undefined &&
      input.moTa === undefined &&
      input.imageUploadId === undefined
    )
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE');
    return this.write(async (manager) => {
      await this.lockOrThrow(manager, id);
      const name =
        input.ten === undefined ? undefined : normalizeSpecialtyName(input.ten);
      if (
        name !== undefined &&
        (await this.specialties.nameExists(manager, name, id))
      )
        throw duplicateName();
      await this.specialties.update(manager, id, {
        ten: name,
        moTa: input.moTa,
      });
      await this.images.assignSpecialty(
        manager,
        id,
        accountId,
        input.imageUploadId,
        new Date(),
      );
      return this.readOrThrow(id, manager);
    });
  }

  setStatus(scope: AdminScope, id: string, input: SpecialtyStatusDto) {
    this.policy.assertToanHeThong(scope);
    return this.write(async (manager) => {
      await this.lockOrThrow(manager, id);
      await this.specialties.setStatus(manager, id, input.trangThaiHoatDong);
      return this.readOrThrow(id, manager);
    });
  }

  private async readOrThrow(id: string, manager?: EntityManager) {
    const row = await this.specialties.get(id, manager);
    if (!row) throw new AppException(404, 'KHONG_TIM_THAY');
    return row;
  }

  private async lockOrThrow(manager: EntityManager, id: string) {
    if (!(await this.specialties.lock(manager, id)))
      throw new AppException(404, 'KHONG_TIM_THAY');
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.specialties.transaction(work);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driver = error.driverError as {
          code?: string;
          sqlMessage?: string;
        };
        // Chỉ UNIQUE tên đã biết; không che lỗi FK/ảnh hoặc lỗi hệ thống thành trùng tên.
        if (
          driver.code === 'ER_DUP_ENTRY' &&
          /for key ['`](?:chuyen_khoa\.)?chuyen_khoa_index_ten['`]/.test(
            driver.sqlMessage ?? '',
          )
        )
          throw duplicateName();
      }
      throw error;
    }
  }
}

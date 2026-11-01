import { Inject, Injectable } from '@nestjs/common';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN } from '../../common/time/time.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type {
  CreateServiceDto,
  ServiceListDto,
  UpdateServiceDto,
} from './service.dto.js';
import { normalizeServiceName } from './service.dto.js';
import { ServiceRepository } from './service.repository.js';

const duplicateName = () =>
  new AppException(409, 'TEN_DICH_VU_TRUNG', {
    thongBao: 'Tên dịch vụ đã tồn tại trong nhóm này.',
  });
const groupNotFound = () => new AppException(400, 'NHOM_DICH_VU_KHONG_TON_TAI');
const durationInUse = () => new AppException(409, 'THOI_LUONG_DANG_DUNG');

@Injectable()
export class ServiceService {
  constructor(
    @Inject(ServiceRepository) private readonly services: ServiceRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  list(_scope: AdminScope, input: ServiceListDto) {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    return this.services.list(input);
  }

  async get(_scope: AdminScope, id: string) {
    const row = await this.services.getById(id);
    if (!row) throw new AppException(404, 'KHONG_TIM_THAY');
    return row;
  }

  create(scope: AdminScope, input: CreateServiceDto) {
    this.policy.assertToanHeThong(scope);
    return this.write(async (manager) => {
      await this.lockGroupOrThrow(manager, input.nhomDichVuId);
      const name = normalizeServiceName(input.ten);
      if (await this.services.nameExists(manager, input.nhomDichVuId, name))
        throw duplicateName();
      return this.services.create(manager, input, name);
    });
  }

  update(scope: AdminScope, id: string, input: UpdateServiceDto) {
    this.policy.assertToanHeThong(scope);
    if (
      input.nhomDichVuId === undefined &&
      input.ten === undefined &&
      input.thoiLuong === undefined &&
      input.giaMacDinh === undefined
    )
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE');

    return this.write(async (manager) => {
      const current = await this.services.lock(manager, id);
      if (!current) throw new AppException(404, 'KHONG_TIM_THAY');

      const groupId = input.nhomDichVuId ?? current.nhomDichVuId;
      await this.lockGroupOrThrow(manager, groupId);
      const name =
        input.ten === undefined ? current.ten : normalizeServiceName(input.ten);
      if (await this.services.nameExists(manager, groupId, name, id))
        throw duplicateName();

      if (
        input.thoiLuong !== undefined &&
        input.thoiLuong !== current.thoiLuong &&
        ((await this.services.hasActiveAppointments(manager, id)) ||
          (await this.services.hasFutureSlots(manager, id, nowVN())))
      )
        throw durationInUse();

      return this.services.update(manager, id, groupId, input, name);
    });
  }

  private async lockGroupOrThrow(manager: EntityManager, id: string) {
    if (!(await this.services.lockGroup(manager, id))) throw groupNotFound();
  }

  private async write<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.services.transaction(work);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const driver = error.driverError as {
          code?: string;
          sqlMessage?: string;
        };
        const message = driver.sqlMessage ?? '';
        if (
          driver.code === 'ER_DUP_ENTRY' &&
          /dich_vu_kham_index_nhom_ten/u.test(message)
        )
          throw duplicateName();
        if (
          driver.code === 'ER_NO_REFERENCED_ROW_2' &&
          /FOREIGN KEY \(`nhom_dich_vu_id`\) REFERENCES `nhom_dich_vu`/u.test(
            message,
          )
        )
          throw groupNotFound();
      }
      throw error;
    }
  }
}

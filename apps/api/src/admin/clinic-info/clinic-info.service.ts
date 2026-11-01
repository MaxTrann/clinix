import { Inject, Injectable } from '@nestjs/common';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { ThongTinPhongKham } from '../entities/thong-tin-phong-kham.entity.js';
import type { UpdateClinicInfoDto } from './clinic-info.dto.js';
import { ClinicInfoRepository } from './clinic-info.repository.js';

export interface ClinicInfoResponse {
  tenThuongHieu: string | null;
  diaChiTruSo: string | null;
  duongDayNong: string | null;
  email: string | null;
}

const EMPTY_CLINIC_INFO: ClinicInfoResponse = {
  tenThuongHieu: null,
  diaChiTruSo: null,
  duongDayNong: null,
  email: null,
};

function toResponse(row: ThongTinPhongKham | null): ClinicInfoResponse {
  if (row === null) return { ...EMPTY_CLINIC_INFO };
  return {
    tenThuongHieu: row.tenThuongHieu,
    diaChiTruSo: row.diaChiTruSo,
    duongDayNong: row.duongDayNong,
    email: row.email,
  };
}

@Injectable()
export class ClinicInfoService {
  constructor(
    @Inject(ClinicInfoRepository)
    private readonly clinicInfo: ClinicInfoRepository,
    @Inject(BranchAccessPolicy)
    private readonly policy: BranchAccessPolicy,
  ) {}

  async get(scope: AdminScope): Promise<ClinicInfoResponse> {
    this.policy.assertToanHeThong(scope);
    return toResponse(await this.clinicInfo.get());
  }

  async update(
    scope: AdminScope,
    input: UpdateClinicInfoDto,
  ): Promise<ClinicInfoResponse> {
    this.policy.assertToanHeThong(scope);
    return toResponse(await this.clinicInfo.upsert(input));
  }
}

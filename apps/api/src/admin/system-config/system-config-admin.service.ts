import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { CauHinhHeThong } from '../entities/cau-hinh-he-thong.entity.js';
import { SystemConfigAdminRepository } from './system-config-admin.repository.js';
import type { UpdateSystemConfigDto } from './system-config.dto.js';
import {
  CONFIG_FIELD_CODES,
  configInvalidData,
  configNoChange,
} from './system-config.errors.js';
import {
  CONFIG_KEYS,
  CONFIG_PARAMS,
  normalizeReminders,
  sameConfigValue,
  weightsOf,
  weightsSumToOne,
  type ConfigKey,
  type ConfigPatch,
  type ConfigValue,
  type ConfigValues,
} from './system-config-params.js';
import { SystemConfigService } from './system-config.service.js';

// Hình dạng GET và kết quả của PUT: khoá camelCase, giá trị là số (trọng số cũng là số, không chuỗi); chưa có dòng thì `chuaCauHinh = true` và mọi giá trị là null.
export type SystemConfigResponse = { chuaCauHinh: boolean } & Record<
  ConfigKey,
  ConfigValue | null
>;

// Tạo lần đầu xong thì người tạo thứ hai (bị 1062 ở INSERT) chạy lại ĐÚNG MỘT lần: lần chạy lại thấy dòng và đi đường cập nhật.
const MAX_ATTEMPTS = 2;

// Hàng DB sang giá trị của API: trọng số decimal(3,2) về số, nhắc lịch chuẩn hoá giảm dần.
function valuesOf(row: CauHinhHeThong): ConfigValues {
  return {
    thoiGianGiuCho: row.thoiGianGiuCho,
    thoiDiemNhacLich: normalizeReminders(row.thoiDiemNhacLich),
    soLichHenToiDaMoiHoSo: row.soLichHenToiDaMoiHoSo,
    soLanTuDoiLichToiDa: row.soLanTuDoiLichToiDa,
    checkInTruocPhut: row.checkInTruocPhut,
    checkInSauPhut: row.checkInSauPhut,
    thoiHanPhanHoiLoiMoi: row.thoiHanPhanHoiLoiMoi,
    soMucChoToiDa: row.soMucChoToiDa,
    nguongNoShow: row.nguongNoShow,
    soNgayBaoTruocDoiGioLam: row.soNgayBaoTruocDoiGioLam,
    trongSoW1: Number(row.trongSoW1),
    trongSoW2: Number(row.trongSoW2),
  };
}

function toResponse(values: ConfigValues | null): SystemConfigResponse {
  const body = Object.fromEntries(
    CONFIG_KEYS.map((key) => [key, values === null ? null : values[key]]),
  ) as Record<ConfigKey, ConfigValue | null>;
  return { chuaCauHinh: values === null, ...body };
}

// Chỉ các tham số người dùng gửi; nhắc lịch chuẩn hoá để thứ tự đầu vào không ảnh hưởng so sánh và nhật ký.
function patchOf(input: UpdateSystemConfigDto): ConfigPatch {
  const patch: ConfigPatch = {};
  for (const key of CONFIG_KEYS) {
    const value = input[key];
    if (value === undefined) continue;
    patch[key] = Array.isArray(value) ? normalizeReminders(value) : value;
  }
  return patch;
}

// Khoá của nhật ký là TÊN CỘT (CH-18).
function byColumn<T>(
  keys: readonly ConfigKey[],
  pick: (key: ConfigKey) => T,
): Record<string, T> {
  return Object.fromEntries(
    keys.map((key) => [CONFIG_PARAMS[key].column, pick(key)]),
  );
}

// w1 + w2 = 1,00 tính bằng phần trăm nguyên trên giá trị HIỆU LỰC (đã gộp với dòng hiện có).
function assertWeightsSumToOne(values: ConfigPatch): void {
  const weights = weightsOf(values);
  if (weights !== null && weightsSumToOne(weights[0], weights[1])) return;
  throw configInvalidData(
    (['trongSoW1', 'trongSoW2'] as const).map((truong) => ({
      truong,
      ma: CONFIG_FIELD_CODES.weightsSum,
    })),
  );
}

@Injectable()
export class SystemConfigAdminService {
  constructor(
    @Inject(SystemConfigService) private readonly reader: SystemConfigService,
    @Inject(SystemConfigAdminRepository)
    private readonly repository: SystemConfigAdminRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  // Đọc nhất quán không khoá (qua `SystemConfigService` của C3): không bị chặn bởi người đang sửa.
  async read(): Promise<SystemConfigResponse> {
    const row = await this.reader.get();
    return toResponse(row === null ? null : valuesOf(row));
  }

  async update(
    scope: AdminScope,
    actorId: string,
    input: UpdateSystemConfigDto,
  ): Promise<SystemConfigResponse> {
    this.policy.assertToanHeThong(scope);
    const patch = patchOf(input);
    let attempt = 1;
    for (;;) {
      try {
        return await this.repository.transaction((manager) =>
          this.apply(manager, actorId, input.lyDo, patch),
        );
      } catch (error) {
        // `cau_hinh_he_thong` chỉ có một khoá duy nhất (`id`), nên 1062 ở đây là người tạo lần đầu khác vừa commit.
        if (attempt >= MAX_ATTEMPTS || !isDuplicateKeyError(error)) throw error;
        attempt += 1;
      }
    }
  }

  private async apply(
    manager: EntityManager,
    actorId: string,
    reason: string,
    patch: ConfigPatch,
  ): Promise<SystemConfigResponse> {
    const row = await this.repository.lockRow(manager);
    const saved =
      row === null
        ? await this.create(manager, actorId, reason, patch)
        : await this.change(manager, actorId, reason, valuesOf(row), patch);
    return toResponse(saved);
  }

  // Tạo lần đầu (Q35): đủ bảy cột không có DEFAULT mới tạo; cột có DEFAULT bỏ trống thì DB điền. Nhật ký: `truoc = null` và `sau` đủ 12 khoá (đọc lại sau INSERT).
  private async create(
    manager: EntityManager,
    actorId: string,
    reason: string,
    patch: ConfigPatch,
  ): Promise<ConfigValues> {
    const missing = CONFIG_KEYS.filter(
      (key) => CONFIG_PARAMS[key].requiredOnCreate && patch[key] === undefined,
    );
    if (missing.length > 0)
      throw configInvalidData(
        missing.map((truong) => ({
          truong,
          ma: CONFIG_FIELD_CODES.missingOnCreate,
        })),
      );
    assertWeightsSumToOne(patch);
    await this.repository.insertRow(manager, patch);
    const saved = valuesOf(await this.repository.reload(manager));
    await this.record(
      manager,
      actorId,
      reason,
      byColumn(CONFIG_KEYS, () => null),
      byColumn(CONFIG_KEYS, (key) => saved[key]),
    );
    return saved;
  }

  // Cập nhật: chỉ tham số có đổi thật sự (so với dòng đã khoá); không đổi gì thì không UPDATE, không nhật ký.
  private async change(
    manager: EntityManager,
    actorId: string,
    reason: string,
    current: ConfigValues,
    patch: ConfigPatch,
  ): Promise<ConfigValues> {
    const changedKeys = CONFIG_KEYS.filter((key) => {
      const next = patch[key];
      return next !== undefined && !sameConfigValue(current[key], next);
    });
    if (changedKeys.length === 0) throw configNoChange();
    const changed: ConfigPatch = {};
    for (const key of changedKeys) changed[key] = patch[key];
    if (changedKeys.includes('trongSoW1') || changedKeys.includes('trongSoW2'))
      assertWeightsSumToOne({ ...current, ...changed });
    await this.repository.updateRow(manager, changed);
    const saved = valuesOf(await this.repository.reload(manager));
    await this.record(
      manager,
      actorId,
      reason,
      byColumn(changedKeys, (key) => current[key]),
      byColumn(changedKeys, (key) => saved[key]),
    );
    return saved;
  }

  // Cùng `manager` của giao dịch: lỗi ghi nhật ký (kể cả CHECK DB từ chối) làm hỏng CẢ giao dịch, cấu hình không đổi (A4, CH-14, CH-15). Không bắt lỗi.
  private record(
    manager: EntityManager,
    actorId: string,
    reason: string,
    truoc: Record<string, ConfigValue | null>,
    sau: Record<string, ConfigValue>,
  ): Promise<void> {
    return this.audit.record(manager, {
      actorId,
      branchId: null,
      action: 'CapNhatCauHinh',
      targetType: 'cau_hinh_he_thong',
      targetId: '1',
      result: 'ThanhCong',
      changes: { truoc, sau, ly_do: reason },
    });
  }
}

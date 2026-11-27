import type {
  DoctorRow,
  DoctorSource,
  PolicyConfigSource,
} from '../context/context.types.js';
import {
  placeholderKey,
  uniqueRefs,
  type PlaceholderRef,
} from '../context/placeholder.js';
import type {
  EntityNeeds,
  ResolvedEntities,
} from '../context/public-context.repository.js';
import { RESOLVE_MAX_ENTITIES } from './answer.constants.js';
import type { ResolvedValue } from './answer.types.js';
import {
  formatDoctorName,
  formatFromPrice,
  formatMinutes,
  formatMoney,
  formatRefundTiers,
  formatTimes,
  formatWeeklyHours,
} from './entity-formatters.js';

// ĐỌC LẠI thực thể được nhắc khi dựng đoạn (chatbot B2; PLAN chatbot 5.4 bước 14, 5.7, DCR-11): chuyên khoa ngừng, bác sĩ bị khoá, dịch vụ bị gỡ,
// chi nhánh mất, hotline hay email bị xoá giữa lúc dựng ngữ cảnh và lúc trả lời thì KHÔNG dựng đoạn (cũng là V2). Chữ trả về là chữ MÁY CHỦ dựng từ DB,
// không bao giờ từ mô hình. Không ghi, không khoá, không log.

export interface EntityReader {
  readEntities(needs: EntityNeeds): Promise<ResolvedEntities>;
}

export interface EntityResolverDeps {
  readonly reader: EntityReader;
  readonly doctors: Pick<DoctorSource, 'findById'>;
  readonly config: PolicyConfigSource;
}

export type ResolveResult =
  | { readonly ok: true; readonly values: ReadonlyMap<string, ResolvedValue> }
  /** `tooMany`: quá `RESOLVE_MAX_ENTITIES` thực thể khác nhau (chưa đọc DB); `gone`: có thực thể không còn hiệu lực. */
  | { readonly ok: false; readonly reason: 'tooMany' | 'gone' };

const GONE: ResolveResult = { ok: false, reason: 'gone' };

const NO_ENTITIES: ResolvedEntities = {
  specialties: new Map(),
  branches: new Map(),
  services: new Map(),
  clinic: null,
};

const hasAnyNeed = (needs: EntityNeeds): boolean =>
  needs.clinic ||
  needs.specialtyIds.length > 0 ||
  needs.branchIds.length > 0 ||
  needs.serviceIds.length > 0;

const idsOf = (
  refs: readonly PlaceholderRef[],
  ...kinds: readonly PlaceholderRef['kind'][]
): string[] => [
  ...new Set(
    refs.filter((ref) => kinds.includes(ref.kind)).map((ref) => ref.id),
  ),
];

export class EntityResolver {
  constructor(private readonly deps: EntityResolverDeps) {}

  /**
   * `refs` có thể trùng nhau rất nhiều (800 ký tự chứa được hơn 100 chỗ giữ): khử trùng theo khoá `LOẠI:id` TRƯỚC, quá `RESOLVE_MAX_ENTITIES` thì từ chối
   * ngay khi chưa đọc gì (mỗi bác sĩ là một truy vấn). Bác sĩ đọc tuần tự (tối đa 8 trong ngữ cảnh), phần còn lại cùng MỘT giao dịch chỉ đọc.
   */
  async resolve(refs: readonly PlaceholderRef[]): Promise<ResolveResult> {
    const unique = uniqueRefs(refs);
    if (unique.length > RESOLVE_MAX_ENTITIES) {
      return { ok: false, reason: 'tooMany' };
    }

    const doctors = new Map<string, DoctorRow>();
    for (const id of idsOf(unique, 'BS', 'GIA')) {
      const doctor = await this.deps.doctors.findById(id);
      if (doctor === null) return GONE;
      doctors.set(id, doctor);
    }

    const needs: EntityNeeds = {
      specialtyIds: idsOf(unique, 'CK'),
      branchIds: idsOf(unique, 'CN', 'DC', 'GIO'),
      serviceIds: idsOf(unique, 'DV', 'GIADV', 'COC', 'TL', 'HOAN'),
      refundServiceIds: idsOf(unique, 'HOAN'),
      clinic: unique.some((ref) => ref.kind === 'PK'),
    };
    // Chỉ có bác sĩ và cấu hình thì khỏi mở thêm giao dịch đọc
    const entities = hasAnyNeed(needs)
      ? await this.deps.reader.readEntities(needs)
      : NO_ENTITIES;
    const config = unique.some((ref) => ref.kind === 'CS')
      ? await this.deps.config.get()
      : null;

    const values = new Map<string, ResolvedValue>();
    for (const ref of unique) {
      const value = valueOf(ref, { doctors, entities, config });
      if (value === null) return GONE;
      values.set(placeholderKey(ref), value);
    }
    return { ok: true, values };
  }
}

interface Facts {
  readonly doctors: ReadonlyMap<string, DoctorRow>;
  readonly entities: ResolvedEntities;
  readonly config: {
    readonly thoiGianGiuCho: number;
    readonly soLanTuDoiLichToiDa: number;
  } | null;
}

/** Giá trị của một chỗ giữ, hoặc `null` khi thực thể không còn (hay chưa từng có). */
function valueOf(ref: PlaceholderRef, facts: Facts): ResolvedValue | null {
  const { doctors, entities, config } = facts;
  const doctor = doctors.get(ref.id);
  const branch = entities.branches.get(ref.id);
  const service = entities.services.get(ref.id);
  switch (ref.kind) {
    case 'CK': {
      const ten = entities.specialties.get(ref.id);
      return ten === undefined
        ? null
        : { chu: ten, entity: { doiTuong: 'ChuyenKhoa', id: ref.id } };
    }
    case 'BS':
      return doctor
        ? {
            chu: formatDoctorName(doctor.chucDanh, doctor.hoTen),
            entity: { doiTuong: 'BacSi', id: ref.id },
          }
        : null;
    case 'GIA':
      return doctor ? { chu: formatMoney(doctor.giaKham) } : null;
    case 'CN':
      return branch
        ? { chu: branch.ten, entity: { doiTuong: 'ChiNhanh', id: ref.id } }
        : null;
    case 'DC':
      return branch ? { chu: branch.diaChi } : null;
    case 'GIO':
      return branch ? { chu: formatWeeklyHours(branch.schedule) } : null;
    case 'DV':
      return service
        ? { chu: service.ten, entity: { doiTuong: 'DichVu', id: ref.id } }
        : null;
    case 'GIADV':
      return service ? { chu: formatFromPrice(service.giaMacDinh) } : null;
    case 'COC':
      return service ? { chu: formatMoney(service.mucDatCoc) } : null;
    case 'TL':
      return service ? { chu: formatMinutes(service.thoiLuong) } : null;
    case 'HOAN':
      return service ? { chu: formatRefundTiers(service.refund) } : null;
    case 'PK': {
      const text =
        ref.id === 'hotline'
          ? entities.clinic?.hotline
          : entities.clinic?.email;
      return text ? { chu: text } : null;
    }
    case 'CS':
      if (config === null) return null;
      return ref.id === 'giuCho'
        ? { chu: formatMinutes(config.thoiGianGiuCho) }
        : { chu: formatTimes(config.soLanTuDoiLichToiDa) };
  }
}

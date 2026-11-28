import { AnswerReconciler } from '../answer/answer-reconciler.js';
import {
  EntityResolver,
  type EntityReader,
} from '../answer/entity-resolver.js';
import type { ModelAnswer } from '../answer/output.schema.js';
import type { ResolvedValue } from '../answer/answer.types.js';
import type { ActiveSpecialtySource } from '../answer/specialty-mapper.js';
import { ADDRESS_HEADING } from '../ask/ask.constants.js';
import {
  BranchDirectory,
  type BranchAddress,
} from '../ask/branch-directory.js';
import { ContextBuilder } from '../context/context-builder.js';
import type {
  BaseSnapshot,
  BaseSource,
  DoctorRow,
  DoctorSource,
  NowSource,
  PolicyConfig,
  PolicyConfigSource,
} from '../context/context.types.js';
import {
  toPlaceholderRef,
  type PlaceholderRef,
} from '../context/placeholder.js';
import type {
  EntityNeeds,
  ResolvedBranch,
  ResolvedEntities,
  ResolvedService,
} from '../context/public-context.repository.js';
import type {
  AiProvider,
  AiRawAnswer,
  AiRequest,
  ProviderName,
} from '../providers/ai-provider.js';
import { ProviderError } from '../providers/provider-error.js';
import { CANNED_ANSWERS } from '../safety/canned-answers.js';
import { normalizeQuestion } from '../safety/question-normalizer.js';
import {
  CATALOG_BRANCHES,
  CATALOG_SERVICES,
  CLINIC_DEMO,
  CONFIG_DEMO,
  SPECIALTY_NAMES,
} from '../../database/seeds/catalog-data.js';
import {
  DEMO_DOCTORS,
  SPECIALTY_DESCRIPTIONS,
} from '../../database/seeds/search-demo-data.js';
import type { ScheduleRow } from '../../search/common/weekly-schedule.view.js';
import type { GoldenSet } from './golden-set.js';

// THẾ GIỚI MẪU của bộ câu hỏi chuẩn (chatbot X2): dữ liệu công khai dựng từ seed (`database/seeds/catalog-data.ts`, `search-demo-data.ts`) và giữ TRONG BỘ NHỚ,
// nên không cần DB (phương án B của kế hoạch X2, Đại duyệt 28/11/2026). Đây là cách X1 đã đo. Id gán theo THỨ TỰ TRONG SEED (seed không có id, DB tự tăng):
//   chuyên khoa 1 đến 8, chi nhánh 1 đến 4, dịch vụ 1 đến 3, bác sĩ công khai từ 11 (bác sĩ `active: false` không vào, đúng điều kiện công khai).
// Chỉ ĐỌC các hằng của seed; không đọc DB, không biến môi trường. Phần SQL thật (PublicContextRepository, PublicDoctorService) đã có int-spec ở B2, B4.

/** Id bác sĩ đầu tiên (khác dải id chuyên khoa, chi nhánh, dịch vụ để nhầm loại id lộ ra). */
export const DOCTOR_ID_BASE = 11;

/**
 * Giờ nhận khám theo ghi chú của seed: Thứ Hai đến Thứ Bảy sáng 08–12 và chiều 13–17, Chủ Nhật nghỉ; chi nhánh thứ 2 chỉ khám sáng thứ Bảy;
 * chi nhánh thứ 3 thêm sáng Chủ Nhật; chi nhánh thứ 4 nghỉ thứ Bảy (`search-demo-data.ts`, `SCHEDULE_CHANGES`).
 */
export function scheduleOfBranch(branchIndex: number): ScheduleRow[] {
  const full = (day: number): ScheduleRow => ({
    thuTrongTuan: day,
    hoatDong: true,
    gioBatDauSang: '08:00:00',
    gioKetThucSang: '12:00:00',
    gioBatDauChieu: '13:00:00',
    gioKetThucChieu: '17:00:00',
  });
  const morningOnly = (day: number): ScheduleRow => ({
    ...full(day),
    gioBatDauChieu: null,
    gioKetThucChieu: null,
  });
  const closed = (day: number): ScheduleRow => ({
    thuTrongTuan: day,
    hoatDong: false,
    gioBatDauSang: null,
    gioKetThucSang: null,
    gioBatDauChieu: null,
    gioKetThucChieu: null,
  });
  const rows = [1, 2, 3, 4, 5].map(full);
  rows.push(
    branchIndex === 1
      ? morningOnly(6)
      : branchIndex === 3
        ? closed(6)
        : full(6),
  );
  rows.push(branchIndex === 2 ? morningOnly(7) : closed(7));
  return rows;
}

const nonBlank = (value: string | null): string | null =>
  value === null || value.trim() === '' ? null : value;

const specialtyIdOfName = (name: string): string => {
  const index = SPECIALTY_NAMES.findIndex((candidate) => candidate === name);
  if (index < 0) throw new Error(`chuyên khoa lạ trong seed: ${name}`);
  return String(index + 1);
};

const branchIdOfName = (name: string): string => {
  const index = CATALOG_BRANCHES.findIndex((branch) => branch.ten === name);
  if (index < 0) throw new Error(`chi nhánh lạ trong seed: ${name}`);
  return String(index + 1);
};

const serviceIdOfName = (name: string): string => {
  const index = CATALOG_SERVICES.findIndex((service) => service.name === name);
  if (index < 0) throw new Error(`dịch vụ lạ trong seed: ${name}`);
  return String(index + 1);
};

export function sampleDoctors(): DoctorRow[] {
  const rows: DoctorRow[] = [];
  DEMO_DOCTORS.forEach((doctor, index) => {
    if (!doctor.active) return;
    const service = CATALOG_SERVICES.find((s) => s.name === doctor.service);
    if (service === undefined)
      throw new Error('dịch vụ của bác sĩ không có trong seed');
    rows.push({
      bacSiId: String(DOCTOR_ID_BASE + index),
      hoTen: doctor.name,
      chucDanh: doctor.title,
      chuyenKhoaId: specialtyIdOfName(doctor.specialty),
      chuyenKhoaTen: doctor.specialty,
      chiNhanhId: branchIdOfName(doctor.branch.ten),
      chiNhanhTen: doctor.branch.ten,
      dichVuKhamId: serviceIdOfName(doctor.service),
      dichVuTen: doctor.service,
      giaKham: service.price,
    });
  });
  return rows;
}

/** MỘT đối tượng thoả mọi giao diện nguồn mà `ContextBuilder`, `EntityResolver`, `AnswerReconciler` và `BranchDirectory` cần. */
export class SampleWorld
  implements
    BaseSource,
    DoctorSource,
    PolicyConfigSource,
    EntityReader,
    ActiveSpecialtySource
{
  readonly doctors = sampleDoctors();

  loadBase(): Promise<BaseSnapshot> {
    const specialties = SPECIALTY_NAMES.map((ten, index) => ({
      id: String(index + 1),
      ten,
      moTa: SPECIALTY_DESCRIPTIONS[ten] ?? null,
    })).sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    return Promise.resolve({
      clinic: {
        ten: nonBlank(CLINIC_DEMO.tenThuongHieu),
        hotline: nonBlank(CLINIC_DEMO.duongDayNong),
        email: nonBlank(CLINIC_DEMO.email),
      },
      branches: CATALOG_BRANCHES.map((branch, index) => ({
        id: String(index + 1),
        ten: branch.ten,
      })),
      specialties,
      services: CATALOG_SERVICES.map((service, index) => ({
        id: String(index + 1),
        ten: service.name,
      })),
    });
  }

  listAll(): Promise<readonly DoctorRow[]> {
    return Promise.resolve(this.doctors);
  }

  findById(id: string): Promise<DoctorRow | null> {
    return Promise.resolve(
      this.doctors.find((doctor) => doctor.bacSiId === id) ?? null,
    );
  }

  get(): Promise<PolicyConfig> {
    return Promise.resolve({
      thoiGianGiuCho: CONFIG_DEMO.thoiGianGiuCho,
      soLanTuDoiLichToiDa: CONFIG_DEMO.soLanTuDoiLichToiDa,
    });
  }

  findActiveSpecialties(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const result = new Map<string, string>();
    for (const id of ids) {
      const name = SPECIALTY_NAMES[Number(id) - 1];
      if (name !== undefined) result.set(id, name);
    }
    return Promise.resolve(result);
  }

  /** Đọc lại đúng các thực thể được nhắc. Dịch vụ của seed có cọc `0.00` nên mốc hoàn là `null` (không áp dụng). */
  readEntities(needs: EntityNeeds): Promise<ResolvedEntities> {
    const specialties = new Map<string, string>();
    for (const id of needs.specialtyIds) {
      const name = SPECIALTY_NAMES[Number(id) - 1];
      if (name !== undefined) specialties.set(id, name);
    }
    const branches = new Map<string, ResolvedBranch>();
    for (const id of needs.branchIds) {
      const index = Number(id) - 1;
      const branch = CATALOG_BRANCHES[index];
      if (branch !== undefined) {
        branches.set(id, {
          ten: branch.ten,
          diaChi: branch.diaChi,
          schedule: scheduleOfBranch(index),
        });
      }
    }
    const services = new Map<string, ResolvedService>();
    for (const id of needs.serviceIds) {
      const service = CATALOG_SERVICES[Number(id) - 1];
      if (service !== undefined) {
        services.set(id, {
          ten: service.name,
          giaMacDinh: service.price,
          mucDatCoc: '0.00',
          thoiLuong: service.duration,
          refund: null,
        });
      }
    }
    return Promise.resolve({
      specialties,
      branches,
      services,
      clinic: needs.clinic
        ? {
            ten: nonBlank(CLINIC_DEMO.tenThuongHieu),
            hotline: nonBlank(CLINIC_DEMO.duongDayNong),
            email: nonBlank(CLINIC_DEMO.email),
          }
        : null,
    });
  }

  /** Địa chỉ chi nhánh cho câu khẩn cấp (cùng thứ tự theo tên như câu SQL thật của `createBranchLoader`). */
  branchAddresses(): Promise<readonly BranchAddress[]> {
    return Promise.resolve(
      CATALOG_BRANCHES.map((branch, index) => ({
        id: String(index + 1),
        ten: branch.ten,
        diaChi: branch.diaChi,
      })),
    );
  }

  /** Mọi chỗ giữ có thể có trong thế giới mẫu (kể cả chỗ không còn hiệu lực như hotline: bộ đọc sẽ từ chối). */
  allRefs(): PlaceholderRef[] {
    const refs: PlaceholderRef[] = [];
    const push = (kind: string, id: string): void => {
      const ref = toPlaceholderRef(kind, id);
      if (ref !== null) refs.push(ref);
    };
    SPECIALTY_NAMES.forEach((_name, index) => push('CK', String(index + 1)));
    this.doctors.forEach((doctor) => {
      push('BS', doctor.bacSiId);
      push('GIA', doctor.bacSiId);
    });
    CATALOG_BRANCHES.forEach((_branch, index) => {
      for (const kind of ['CN', 'DC', 'GIO']) push(kind, String(index + 1));
    });
    CATALOG_SERVICES.forEach((_service, index) => {
      for (const kind of ['DV', 'GIADV', 'COC', 'TL', 'HOAN'])
        push(kind, String(index + 1));
    });
    push('PK', 'hotline');
    push('PK', 'email');
    push('CS', 'giuCho');
    push('CS', 'doiLich');
    return refs;
  }
}

/** Dựng các phần thật của sản phẩm trên thế giới mẫu: ngữ cảnh, bộ đối chiếu, danh bạ chi nhánh. */
export function createSampleDeps(world: SampleWorld, clock: NowSource) {
  const context = new ContextBuilder({
    base: world,
    doctors: world,
    config: world,
    clock,
  });
  const resolver = new EntityResolver({
    reader: world,
    doctors: world,
    config: world,
  });
  const reconciler = new AnswerReconciler({ resolver, specialties: world });
  const branches = new BranchDirectory({
    load: () => world.branchAddresses(),
    clock,
  });
  return { context, resolver, reconciler, branches };
}

/** SỰ THẬT chuẩn để chấm: chữ MÁY CHỦ dựng cho từng chỗ giữ (bằng bộ đọc thật), tên thực thể, và tập chuỗi hợp lệ cho phép kiểm "kín số". */
export interface Truth {
  /** Khoá `LOẠI:id` → giá trị do bộ đọc thật dựng (chỉ chỗ giữ còn hiệu lực). */
  readonly values: ReadonlyMap<string, ResolvedValue>;
  /** Khoá `ĐỐI_TƯỢNG:id` (ví dụ `BacSi:12`) → tên chuẩn. */
  readonly entityNames: ReadonlyMap<string, string>;
  /** Mọi chuỗi hợp lệ, DÀI TRƯỚC: giá trị chỗ giữ, câu dựng sẵn, tiêu đề khối địa chỉ. */
  readonly allowedTexts: readonly string[];
}

export async function buildTruth(world: SampleWorld): Promise<Truth> {
  const { resolver } = createSampleDeps(world, { now: () => 0 });
  const values = new Map<string, ResolvedValue>();
  const entityNames = new Map<string, string>();
  for (const ref of world.allRefs()) {
    const result = await resolver.resolve([ref]);
    if (!result.ok) continue;
    const value = result.values.get(`${ref.kind}:${ref.id}`);
    if (value === undefined) continue;
    values.set(`${ref.kind}:${ref.id}`, value);
    if (value.entity)
      entityNames.set(`${value.entity.doiTuong}:${value.entity.id}`, value.chu);
  }
  const allowed = new Set<string>();
  for (const value of values.values()) allowed.add(value.chu);
  for (const canned of Object.values(CANNED_ANSWERS)) {
    for (const line of canned.doan) allowed.add(line);
  }
  allowed.add(ADDRESS_HEADING);
  const allowedTexts = [...allowed].sort((a, b) => b.length - a.length);
  return { values, entityNames, allowedTexts };
}

/** Bảng dữ liệu chuẩn để hai người đối chiếu mẫu CB2: nhãn và giá trị, theo thứ tự khoá. */
export function truthTable(truth: Truth): [string, string][] {
  return [...truth.values.entries()].map(([key, value]) => [key, value.chu]);
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Nhà cung cấp GIẢ cho `--dry-run` và test (không mạng, không khoá). `testing/` bị `tsconfig.build.json` loại khỏi `dist/`, nên không dùng được `FakeProvider`.

export type DryRunScript = (
  layer: ProviderName,
  request: AiRequest<unknown>,
) => ModelAnswer | ProviderError;

/** Ghi lại một lời gọi giả để bộ đếm token, bộ đếm 429 và thống kê chạy như với lời gọi thật. */
export type DryRunSink = (call: {
  layer: ProviderName;
  failure: ProviderError | null;
  tokensIn: number;
  tokensOut: number;
}) => void;

export class DryRunProvider implements AiProvider {
  readonly configured = true;

  constructor(
    readonly name: ProviderName,
    private readonly script: DryRunScript,
    private readonly sink?: DryRunSink,
  ) {}

  generate(request: AiRequest<unknown>): Promise<AiRawAnswer> {
    const outcome = this.script(this.name, request);
    const tokensIn = Math.ceil(
      (request.systemPrompt.length +
        request.context.length +
        request.question.length) /
        3,
    );
    if (outcome instanceof ProviderError) {
      this.sink?.({
        layer: this.name,
        failure: outcome,
        tokensIn,
        tokensOut: 0,
      });
      return Promise.reject(outcome);
    }
    const text = JSON.stringify(outcome);
    this.sink?.({
      layer: this.name,
      failure: null,
      tokensIn,
      tokensOut: Math.ceil(text.length / 3),
    });
    return Promise.resolve({ text });
  }
}

const refText = (keys: readonly string[]): string =>
  keys.map((key) => `[[${key}]]`).join(', ');

/**
 * Kịch bản mặc định của `--dry-run`: mô hình "lý tưởng" trả đúng theo kỳ vọng từng câu (nhắc đủ chỗ giữ, chọn chuyên khoa chấp nhận đầu tiên, gắn `ngoaiPhamVi`
 * cho nhóm C, từ chối lịch sự nhóm E). Chạy toàn bộ đường `AskService` nên chứng minh dây nối, đối chiếu V1 đến V9 và chỗ giữ có mặt trong ngữ cảnh.
 * Câu lạ thì trả một câu hỏi đáp chung. KHÔNG phải số đo thật.
 */
export function defaultDryRunScript(set: GoldenSet): DryRunScript {
  const byQuestion = new Map<string, () => ModelAnswer>();
  const keyOf = (text: string): string => {
    const normalized = normalizeQuestion(text);
    return normalized.ok ? normalized.text : text;
  };
  for (const item of set.cau) {
    const expect = item.kyVong;
    let build: () => ModelAnswer;
    switch (item.nhom) {
      case 'A':
        build = () => ({
          loai: 'hoiDap',
          traLoi: `Thông tin bạn cần: ${refText(expect.nhac ?? [])}.`,
          chuyenKhoaGoiY: [],
        });
        break;
      case 'B': {
        const first = expect.chapNhan?.[0] ?? '1';
        build = () => ({
          loai: 'goiYDatLich',
          traLoi: `Bạn có thể cân nhắc [[CK:${first}]] để được thăm khám.`,
          chuyenKhoaGoiY: [first],
        });
        break;
      }
      case 'C':
        build = () => ({
          loai: 'ngoaiPhamVi',
          traLoi: 'Mình không thể trả lời nội dung này.',
          chuyenKhoaGoiY: [],
        });
        break;
      case 'D':
        build = () => ({
          loai: 'khanCap',
          traLoi: 'Hãy gọi 115.',
          chuyenKhoaGoiY: [],
        });
        break;
      case 'E':
        build = () => ({
          loai: 'hoiDap',
          traLoi:
            'Mình không thể làm theo yêu cầu đó, nhưng có thể giúp bạn tra cứu thông tin phòng khám.',
          chuyenKhoaGoiY: [],
        });
        break;
      case 'F':
        build = () => ({
          loai: 'hoiDap',
          traLoi: 'Hiện phòng khám chưa có dữ liệu về nội dung này.',
          chuyenKhoaGoiY: [],
        });
        break;
    }
    byQuestion.set(keyOf(item.cauHoi), build);
  }
  for (const item of set.phu) {
    byQuestion.set(keyOf(item.cauHoi), () => {
      if (item.ma === 'P01') {
        return { loai: 'khanCap', traLoi: 'Hãy gọi 115.', chuyenKhoaGoiY: [] };
      }
      return {
        loai: 'hoiDap',
        traLoi:
          item.goiYNhac.length > 0
            ? `Thông tin bạn cần: ${refText(item.goiYNhac)}.`
            : 'Bạn nên gặp bác sĩ để được thăm khám.',
        chuyenKhoaGoiY: [],
      };
    });
  }
  return (_layer, request) => {
    const build = byQuestion.get(request.question);
    return build !== undefined
      ? build()
      : {
          loai: 'hoiDap',
          traLoi: 'Hiện phòng khám chưa có dữ liệu về nội dung này.',
          chuyenKhoaGoiY: [],
        };
  };
}

import {
  CONTEXT_CACHE_TTL_MS,
  CONTEXT_DATA_END,
  CONTEXT_DATA_START,
  CONTEXT_MAX_CHARS,
  CONTEXT_MAX_DOCTORS,
  CONTEXT_MAX_MATCHED_SERVICES,
  DOCTOR_ROSTER_MAX_PAGES,
  DOCTOR_ROSTER_PAGE_SIZE,
  SPECIALTY_DESCRIPTION_MAX_CHARS,
} from './context.constants.js';
import { createContextIndex, refsOfBuiltText } from './context-index.js';
import type {
  BaseSnapshot,
  BaseSource,
  BuiltContext,
  ContextBuildInput,
  ContextTrim,
  DoctorRow,
  DoctorSource,
  NamedRow,
  NowSource,
  PolicyConfig,
  PolicyConfigSource,
} from './context.types.js';
import {
  buildQuestionWords,
  matchServices,
  rankDoctors,
} from './keyword-matcher.js';
import { buildPolicyLines } from './policy-knowledge.js';
import {
  formatPlaceholder,
  parsePlaceholders,
  type PlaceholderKind,
} from './placeholder.js';

// Dựng ngữ cảnh dữ liệu công khai gửi cho mô hình (chatbot B2; PLAN chatbot 5.6, T5, T7; NGC-01…NGC-06, CPI-03).
//  - Phần NỀN gửi mỗi câu: phòng khám, chi nhánh, chuyên khoa đang hoạt động, dịch vụ đang cung cấp, chính sách.
//  - Phần THEO TỪ KHOÁ: tối đa 8 bác sĩ khớp tên, chuyên khoa hay chi nhánh trong câu hỏi; chi tiết dịch vụ khớp và dịch vụ của các bác sĩ đó.
//  - KHÔNG BAO GIỜ vào ngữ cảnh: email, SĐT, ngày sinh, địa chỉ cá nhân, học vị, số năm kinh nghiệm, điểm đánh giá, khung giờ trống, bài viết, và mọi con số cần hiển thị:
//    giá, giờ, địa chỉ, mốc hoàn đi qua CHỖ GIỮ `[[LOẠI:id]]`; máy chủ thay bằng chữ lấy từ DB lúc dựng đoạn.
//  - Đệm: MỘT bản chụp, dùng tối đa 60 giây (đồng hồ tiêm vào được); nhiều lời gọi đồng thời chỉ kích hoạt MỘT lần đọc; lần đọc lỗi không vào đệm.
// Lớp thường nhận phụ thuộc qua hàm dựng (không Nest): chatbot B3 bọc bằng provider. Không ghi DB, không đọc biến môi trường, không log.

interface Snapshot {
  readonly base: BaseSnapshot;
  readonly roster: readonly DoctorRow[];
  readonly config: PolicyConfig | null;
  /** Thời điểm BẮT ĐẦU đọc (thận trọng: tuổi bản chụp tính từ lúc bắt đầu, không phải lúc xong). */
  readonly at: number;
}

export interface ContextBuilderDeps {
  readonly base: BaseSource;
  readonly doctors: DoctorSource;
  readonly config: PolicyConfigSource;
  readonly clock: NowSource;
}

const ROSTER_MAX = DOCTOR_ROSTER_MAX_PAGES * DOCTOR_ROSTER_PAGE_SIZE;

/**
 * Làm sạch MỌI chữ lấy từ DB trước khi đặt vào ngữ cảnh (CPI-03): bỏ ký tự điều khiển, gộp khoảng trắng, đổi `[[` và `]]` thành một ngoặc
 * (DB không giả được chỗ giữ), bỏ ký tự dùng riêng (U+E000 là ký tự giữ chỗ nội bộ), thu mỗi dãy `<` hay `>` từ ba ký tự trở lên về một (DB không giả được hai dòng đánh dấu khối dữ liệu).
 */
export function sanitizeDataText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\p{Cc}|\p{Cf}|\p{Co}/gu, ' ')
    .replace(/\[{2,}/g, '[')
    .replace(/\]{2,}/g, ']')
    .replace(/<{3,}/g, '<')
    .replace(/>{3,}/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cắt mô tả ở `max` điểm mã, thêm dấu ba chấm nếu bị cắt. */
export function truncateDescription(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, max).join('')}…`;
}

/** Các phần đã dựng, tách riêng để thử nhiều mức cắt mà không dựng lại từ DB. */
interface Parts {
  readonly header: string[];
  readonly branches: string[];
  readonly specialties: { readonly full: string; readonly bare: string }[];
  readonly services: string[];
  readonly policy: string[];
  /** Dịch vụ khớp tên câu hỏi (đứng trước, ưu tiên khi cắt) và dịch vụ của từng bác sĩ theo thứ tự bác sĩ. */
  readonly matchedServices: readonly NamedRow[];
  readonly doctors: readonly DoctorRow[];
}

const ref = (kind: PlaceholderKind, id: string): string =>
  formatPlaceholder({ kind, id });

function serviceDetailLine(service: NamedRow): string {
  return (
    `- ${ref('DV', service.id)}: giá ${ref('GIADV', service.id)}; ` +
    `cọc ${ref('COC', service.id)}; thời lượng ${ref('TL', service.id)}; ` +
    `hoàn cọc ${ref('HOAN', service.id)}.`
  );
}

function doctorLine(doctor: DoctorRow): string {
  return (
    `- ${ref('BS', doctor.bacSiId)} (họ tên: ${sanitizeDataText(doctor.hoTen)}). ` +
    `Chuyên khoa ${ref('CK', doctor.chuyenKhoaId)}. Chi nhánh ${ref('CN', doctor.chiNhanhId)}. ` +
    `Dịch vụ ${ref('DV', doctor.dichVuKhamId)}. Giá khám ${ref('GIA', doctor.bacSiId)}.`
  );
}

function headerLines(base: BaseSnapshot): string[] {
  const { clinic } = base;
  const pieces: string[] = [];
  if (clinic.ten) pieces.push(`Tên: ${sanitizeDataText(clinic.ten)}.`);
  if (clinic.hotline) pieces.push(`Đường dây nóng: ${ref('PK', 'hotline')}.`);
  if (clinic.email) pieces.push(`Email: ${ref('PK', 'email')}.`);
  return pieces.length === 0 ? [] : ['PHÒNG KHÁM:', `- ${pieces.join(' ')}`];
}

/** Dịch vụ cần chi nhánh chi tiết: dịch vụ khớp tên, rồi dịch vụ của `count` bác sĩ đầu; không trùng id, giữ thứ tự. */
function detailServices(parts: Parts, doctorCount: number): NamedRow[] {
  const seen = new Set<string>();
  const result: NamedRow[] = [];
  const candidates: NamedRow[] = [
    ...parts.matchedServices,
    ...parts.doctors
      .slice(0, doctorCount)
      .map((doctor) => ({ id: doctor.dichVuKhamId, ten: doctor.dichVuTen })),
  ];
  for (const service of candidates) {
    if (seen.has(service.id)) continue;
    seen.add(service.id);
    result.push(service);
  }
  return result;
}

interface Layout {
  readonly descriptions: boolean;
  readonly doctors: number;
  readonly serviceDetails: boolean;
}

function compose(parts: Parts, layout: Layout): string {
  const lines: string[] = [CONTEXT_DATA_START, ...parts.header];
  lines.push('CHI NHÁNH:', ...parts.branches);
  lines.push(
    'CHUYÊN KHOA ĐANG HOẠT ĐỘNG:',
    ...parts.specialties.map((s) => (layout.descriptions ? s.full : s.bare)),
  );
  lines.push('DỊCH VỤ KHÁM:', ...parts.services);
  if (parts.policy.length > 0) {
    lines.push('CHÍNH SÁCH:', ...parts.policy.map((line) => `- ${line}`));
  }
  if (layout.serviceDetails) {
    const details = detailServices(parts, layout.doctors);
    if (details.length > 0) {
      lines.push(
        'DỊCH VỤ LIÊN QUAN ĐẾN CÂU HỎI:',
        ...details.map(serviceDetailLine),
      );
    }
  }
  if (layout.doctors > 0) {
    lines.push(
      'BÁC SĨ LIÊN QUAN ĐẾN CÂU HỎI:',
      ...parts.doctors.slice(0, layout.doctors).map(doctorLine),
    );
  }
  lines.push(CONTEXT_DATA_END);
  return lines.join('\n');
}

export class ContextBuilder {
  private cached: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;

  constructor(private readonly deps: ContextBuilderDeps) {}

  async build(input: ContextBuildInput): Promise<BuiltContext> {
    const snapshot = await this.snapshot();
    const words = buildQuestionWords(input.question, input.previousUserTurn);
    const parts = this.partsFor(snapshot, words, input.branchId);

    const full: Layout = {
      descriptions: true,
      doctors: parts.doctors.length,
      serviceDetails: true,
    };
    const { text, trimmed, overBudget, doctors } = this.fit(parts, full);

    const parsed = parsePlaceholders(text);
    const index = createContextIndex(
      refsOfBuiltText(parsed),
      new Map(snapshot.base.specialties.map((s) => [s.id, s.ten])),
    );
    return {
      text,
      index,
      stats: {
        chars: text.length,
        doctors,
        trimmed,
        overBudget,
        snapshotAgeMs: Math.max(0, this.deps.clock.now() - snapshot.at),
      },
    };
  }

  // ---- đệm: một bản, 60 giây, một lần đọc cho mọi lời gọi đồng thời ---------------------------------------------------------------------------

  private async snapshot(): Promise<Snapshot> {
    const now = this.deps.clock.now();
    const cached = this.cached;
    // Đúng 60 giây là hết hạn; đồng hồ lùi (`age < 0`) cũng coi là hết hạn
    if (
      cached &&
      now - cached.at >= 0 &&
      now - cached.at < CONTEXT_CACHE_TTL_MS
    ) {
      return cached;
    }
    this.loading ??= this.load(now).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(startedAt: number): Promise<Snapshot> {
    const [base, roster, config] = await Promise.all([
      this.deps.base.loadBase(),
      this.deps.doctors.listAll(),
      this.deps.config.get(),
    ]);
    // Lần đọc lỗi ném ra ở trên nên không bao giờ vào đệm; chỉ bản đọc xong mới thay bản cũ
    const snapshot: Snapshot = {
      base,
      roster: roster.slice(0, ROSTER_MAX),
      config,
      at: startedAt,
    };
    this.cached = snapshot;
    return snapshot;
  }

  // ---- dựng các phần -----------------------------------------------------------------------------------------------------------------------------

  private partsFor(
    snapshot: Snapshot,
    words: readonly string[],
    branchId: string | null | undefined,
  ): Parts {
    const { base, roster, config } = snapshot;
    // Chi nhánh lạ thì bỏ qua (không phải lỗi)
    const knownBranch = base.branches.some((branch) => branch.id === branchId);
    return {
      header: headerLines(base),
      branches: base.branches.map(
        (branch) =>
          `- ${ref('CN', branch.id)} ${sanitizeDataText(branch.ten)}. Địa chỉ: ${ref('DC', branch.id)}. Giờ nhận khám: ${ref('GIO', branch.id)}.`,
      ),
      specialties: base.specialties.map((specialty) => {
        const bare = `- ${ref('CK', specialty.id)} ${sanitizeDataText(specialty.ten)}`;
        const description = specialty.moTa
          ? truncateDescription(
              sanitizeDataText(specialty.moTa),
              SPECIALTY_DESCRIPTION_MAX_CHARS,
            )
          : '';
        return {
          bare,
          full: description === '' ? bare : `${bare}: ${description}`,
        };
      }),
      services: base.services.map(
        (service) =>
          `- ${ref('DV', service.id)} ${sanitizeDataText(service.ten)}`,
      ),
      policy: buildPolicyLines(config),
      matchedServices: matchServices(
        base.services,
        words,
        CONTEXT_MAX_MATCHED_SERVICES,
      ),
      doctors: rankDoctors(
        roster,
        words,
        knownBranch ? branchId : null,
        CONTEXT_MAX_DOCTORS,
      ),
    };
  }

  /**
   * Cắt theo đúng thứ tự PLAN 5.6 (kèm bước thứ ba do phiên kiểm duyệt 27/11/2026): (1) bỏ mô tả chuyên khoa, (2) bớt bác sĩ từ người điểm thấp nhất,
   * (3) bỏ chi tiết dịch vụ. Phần nền luôn còn: nếu chính nó vượt trần thì giữ nguyên và đặt cờ `overBudget`.
   */
  private fit(
    parts: Parts,
    full: Layout,
  ): {
    text: string;
    trimmed: ContextTrim;
    overBudget: boolean;
    doctors: number;
  } {
    const fits = (text: string): boolean => text.length <= CONTEXT_MAX_CHARS;
    let text = compose(parts, full);
    if (fits(text)) {
      return {
        text,
        trimmed: 'none',
        overBudget: false,
        doctors: full.doctors,
      };
    }

    text = compose(parts, { ...full, descriptions: false });
    if (fits(text)) {
      return {
        text,
        trimmed: 'descriptions',
        overBudget: false,
        doctors: full.doctors,
      };
    }

    for (let count = full.doctors - 1; count >= 0; count -= 1) {
      text = compose(parts, {
        descriptions: false,
        doctors: count,
        serviceDetails: true,
      });
      if (fits(text)) {
        return { text, trimmed: 'doctors', overBudget: false, doctors: count };
      }
    }

    text = compose(parts, {
      descriptions: false,
      doctors: 0,
      serviceDetails: false,
    });
    return {
      text,
      trimmed: 'serviceDetails',
      overBudget: !fits(text),
      doctors: 0,
    };
  }
}

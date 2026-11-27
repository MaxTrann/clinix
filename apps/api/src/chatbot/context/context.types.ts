import type { PlaceholderRef } from './placeholder.js';

// Kiểu dùng chung của ngữ cảnh công khai (chatbot B2). Chỉ KIỂU: không có giá trị lúc chạy. Id BIGINT luôn là CHUỖI.

/** Một bác sĩ công khai (từ `PublicDoctorItem`, danh sách trắng): KHÔNG email, SĐT, ngày sinh, địa chỉ, học vị, số năm kinh nghiệm, điểm đánh giá. */
export interface DoctorRow {
  readonly bacSiId: string;
  readonly hoTen: string;
  readonly chucDanh: string;
  readonly chuyenKhoaId: string;
  readonly chuyenKhoaTen: string;
  readonly chiNhanhId: string;
  readonly chiNhanhTen: string;
  readonly dichVuKhamId: string;
  readonly dichVuTen: string;
  /** Giá khám đã cộng phụ phí, chuỗi decimal ("350000.00"). Không bao giờ vào ngữ cảnh: chỉ để dựng `[[GIA:id]]`. */
  readonly giaKham: string;
}

export interface SpecialtyRow {
  readonly id: string;
  readonly ten: string;
  readonly moTa: string | null;
}

export interface NamedRow {
  readonly id: string;
  readonly ten: string;
}

export interface ClinicInfo {
  readonly ten: string | null;
  readonly hotline: string | null;
  readonly email: string | null;
}

/** Phần nền: đọc thẳng trong MỘT giao dịch chỉ đọc. */
export interface BaseSnapshot {
  readonly clinic: ClinicInfo;
  readonly branches: readonly NamedRow[];
  /** Chỉ chuyên khoa đang hoạt động (NGC-01). */
  readonly specialties: readonly SpecialtyRow[];
  /** Chỉ dịch vụ có ít nhất một chi nhánh cung cấp (NGC-02). */
  readonly services: readonly NamedRow[];
}

/** Hai giá trị cấu hình mà chính sách nêu bằng chỗ giữ (`SystemConfigService.get()` thoả giao diện này). */
export interface PolicyConfig {
  readonly thoiGianGiuCho: number;
  readonly soLanTuDoiLichToiDa: number;
}

export interface BaseSource {
  loadBase(): Promise<BaseSnapshot>;
}

export interface DoctorSource {
  /** Mọi bác sĩ công khai (tối đa vài trăm), theo nếp sắp của search. */
  listAll(): Promise<readonly DoctorRow[]>;
  /** `null` khi không còn công khai (khoá, chờ kích hoạt, chuyên khoa ngừng, dịch vụ bị gỡ) hay không tồn tại. */
  findById(id: string): Promise<DoctorRow | null>;
}

export interface PolicyConfigSource {
  /** `null` khi hệ thống chưa cấu hình. */
  get(): Promise<PolicyConfig | null>;
}

/** Chỉ cần `now()`: `FakeClock` và `SYSTEM_CLOCK` của P1 đều thoả. */
export interface NowSource {
  now(): number;
}

/** Tập chỗ giữ mà ngữ cảnh ĐÃ phát cho mô hình; luật V2 chỉ cho dùng đúng những chỗ giữ này. */
export interface ContextIndex {
  has(ref: PlaceholderRef): boolean;
  /** Chuyên khoa đang hoạt động lúc dựng bản chụp: id → tên (dùng cho V5 và lọc ánh xạ). */
  readonly activeSpecialties: ReadonlyMap<string, string>;
}

/** Đã cắt tới đâu để vừa trần: không cắt, bỏ mô tả, bớt bác sĩ, bỏ chi tiết dịch vụ. */
export type ContextTrim =
  'none' | 'descriptions' | 'doctors' | 'serviceDetails';

export interface ContextStats {
  readonly chars: number;
  readonly doctors: number;
  readonly trimmed: ContextTrim;
  /** Chính phần nền đã quá trần: giữ nguyên, không cắt (PLAN 5.6 "phần nền luôn còn"). */
  readonly overBudget: boolean;
  /** Tuổi bản chụp lúc dùng (mili giây). */
  readonly snapshotAgeMs: number;
}

export interface BuiltContext {
  /** Gửi nguyên văn làm `AiRequest.context`. */
  readonly text: string;
  readonly index: ContextIndex;
  readonly stats: ContextStats;
}

export interface ContextBuildInput {
  /** Câu đang gửi (đã chuẩn hoá và che định danh). */
  readonly question: string;
  /** Lượt NGƯỜI DÙNG ngay trước (không phải lượt Trợ lý). */
  readonly previousUserTurn?: string;
  /** Chi nhánh đang chọn; id lạ thì bỏ qua. */
  readonly branchId?: string | null;
}

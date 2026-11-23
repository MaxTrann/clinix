import { LONG_TIMEOUT_MS, request } from '../../../shared/api/client';
import { listSpecialtyOptions } from '../doctor-profiles/doctor-profile-service';
import type {
  BranchChoice,
  CreateBody,
  CreateOptions,
  ServiceChoice,
} from './staff-create-model';

// Lời gọi của biểu mẫu "Tạo tài khoản nhân sự" (admin F8 PR2): tạo (B15) và nạp tuỳ chọn chuyên khoa, chi nhánh kèm dịch vụ (B7, B8). Tạo gửi MỘT lần,
// KHÔNG tự thử lại: mất mạng hay hết hạn chờ thì máy chủ có thể đã tạo, nên nơi gọi báo "chưa rõ" cho người dùng tự kiểm tra danh sách.

const OPTIONS_LIMIT = 100;

export type CreateOutcome =
  | { kind: 'sent'; taiKhoanId: string }
  | { kind: 'mailFailed'; taiKhoanId: string }
  | { kind: 'unknown' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

/**
 * Tạo tài khoản. HTTP 201 mà gửi thư lỗi vẫn là tài khoản ĐÃ tạo (`ThatBai`): chỉ `DaGui` mới là đã gửi, mọi dạng không nhận ra là `unknown`
 * (nơi gọi báo "chưa rõ", không bao giờ "đã gửi"). Chỉ giữ `taiKhoanId`: token hay liên kết nếu API lỡ trả thừa cũng không lọt ra ngoài.
 * Lỗi HTTP được ném nguyên cho nơi gọi chọn chữ theo mã.
 */
export async function createStaff(body: CreateBody): Promise<CreateOutcome> {
  const result = await request<unknown>('/admin/staff-accounts', {
    method: 'POST',
    json: body,
    // Gửi thư xảy ra ngay trong lời gọi tạo nên chờ lâu hơn mặc định (như đăng ký, quên mật khẩu), vẫn nhỏ hơn `proxy_read_timeout` của nginx
    timeoutMs: LONG_TIMEOUT_MS,
  });
  if (
    !isRecord(result) ||
    !isText(result.taiKhoanId) ||
    !isRecord(result.guiEmail)
  )
    return { kind: 'unknown' };
  if (result.guiEmail.ketQua === 'DaGui')
    return { kind: 'sent', taiKhoanId: result.taiKhoanId };
  if (result.guiEmail.ketQua === 'ThatBai')
    return { kind: 'mailFailed', taiKhoanId: result.taiKhoanId };
  return { kind: 'unknown' };
}

function readServices(value: unknown): ServiceChoice[] {
  if (!Array.isArray(value)) return [];
  const services: ServiceChoice[] = [];
  for (const item of value) {
    if (isRecord(item) && isText(item.dichVuKhamId) && isText(item.ten))
      services.push({ dichVuKhamId: item.dichVuKhamId, ten: item.ten });
  }
  return services;
}

function readBranches(value: unknown): BranchChoice[] {
  const items =
    isRecord(value) && Array.isArray(value.items) ? value.items : [];
  const branches: BranchChoice[] = [];
  for (const item of items) {
    if (isRecord(item) && isText(item.chiNhanhId) && isText(item.ten))
      branches.push({
        chiNhanhId: item.chiNhanhId,
        ten: item.ten,
        dichVuKham: readServices(item.dichVuKham),
      });
  }
  return branches;
}

/**
 * Chuyên khoa và chi nhánh (kèm dịch vụ khám) cho biểu mẫu: hai lời gọi song song, một trong hai lỗi thì cả lần nạp lỗi.
 * Không gọi `/admin/services` như panel Chỉnh sửa của F7 vì biểu mẫu này không hiện giá. Admin Chi nhánh chỉ nhận chi nhánh của mình (B8).
 */
export async function loadCreateOptions(
  signal?: AbortSignal,
): Promise<CreateOptions> {
  const [specialties, branches] = await Promise.all([
    listSpecialtyOptions(signal),
    request<unknown>('/admin/branches', {
      query: { page: 1, pageSize: OPTIONS_LIMIT },
      signal,
    }),
  ]);
  return { specialties, branches: readBranches(branches) };
}

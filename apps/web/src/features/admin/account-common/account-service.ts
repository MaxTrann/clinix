import { request } from '../../../shared/api/client';
import type {
  AccountListQuery,
  AdminScopeKind,
  BranchOption,
  PagedResult,
  PatientAccount,
} from './account-types';

// Gọi API tài khoản (B17, B18, B19) và danh sách chi nhánh (B7) qua lớp client duy nhất. Dùng chung với F8 (admin F9, TRACKING 9A.12 mục 2.1).
// Lệnh ghi (`lock`, `unlock`, `unlock-no-show`): MỘT lần gửi, KHÔNG thân, không tự thử lại; mất mạng hay hết hạn chờ thì người dùng tự quyết định bấm lại
// (sau khi đã tải lại thấy trạng thái thật). Phản hồi thành công KHÔNG được đọc: nơi gọi luôn tải lại chi tiết bằng `GET`.

export const ACCOUNT_PAGE_SIZE = 20;
const BRANCH_OPTIONS_LIMIT = 100;

const ACCOUNTS_PATH = '/admin/accounts';

/**
 * Đường dẫn kèm chuỗi truy vấn của `GET /admin/accounts`. Client chỉ nhận giá trị đơn cho từng khoá, mà `vaiTro` phải LẶP lại cho nhiều vai trò
 * (F8 gửi ba giá trị), nên chuỗi truy vấn được dựng ở đây rồi nối vào đường dẫn (không sửa client).
 * Admin Chi nhánh KHÔNG gửi `khoaNoShow` (API trả 403) và `chiNhanhId` (API bỏ qua): tham số bị bỏ ở đây để không nơi gọi nào quên.
 * `q` giữ nguyên văn (đã trim): `%`, `_`, `'` do API escape.
 */
export function buildAccountsPath(
  query: AccountListQuery,
  scope: AdminScopeKind,
): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  for (const role of query.vaiTro) params.append('vaiTro', role);
  if (query.trangThai !== undefined) params.set('trangThai', query.trangThai);
  if (scope === 'ToanHeThong') {
    if (query.khoaNoShow !== undefined)
      params.set('khoaNoShow', query.khoaNoShow ? 'true' : 'false');
    if (query.chiNhanhId !== undefined && query.chiNhanhId !== '')
      params.set('chiNhanhId', query.chiNhanhId);
  }
  const text = query.q?.trim() ?? '';
  if (text !== '') params.set('q', text);
  return `${ACCOUNTS_PATH}?${params.toString()}`;
}

export function listAccounts<T = PatientAccount>(
  query: AccountListQuery,
  scope: AdminScopeKind,
  signal?: AbortSignal,
): Promise<PagedResult<T>> {
  return request<PagedResult<T>>(buildAccountsPath(query, scope), { signal });
}

const accountPath = (id: string) =>
  `${ACCOUNTS_PATH}/${encodeURIComponent(id)}`;

export function getAccount<T = PatientAccount>(
  id: string,
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(accountPath(id), { signal });
}

async function postAction(path: string): Promise<void> {
  await request(path, { method: 'POST' });
}

export function lockAccount(id: string): Promise<void> {
  return postAction(`${accountPath(id)}/lock`);
}

export function unlockAccount(id: string): Promise<void> {
  return postAction(`${accountPath(id)}/unlock`);
}

export function unlockNoShow(id: string): Promise<void> {
  return postAction(`${accountPath(id)}/unlock-no-show`);
}

interface BranchListItem {
  chiNhanhId: string;
  ten: string;
}

/**
 * Danh sách chi nhánh cho ô lọc (chỉ Toàn hệ thống dùng). Chỉ giữ hai khoá cần thiết của `GET /admin/branches` (B7), tối đa 100 chi nhánh đầu.
 * Gọi thẳng URL, không import `branch-service` của Trung (thư mục của người kia).
 */
export async function listBranchOptions(
  signal?: AbortSignal,
): Promise<BranchOption[]> {
  const result = await request<PagedResult<BranchListItem>>('/admin/branches', {
    query: { page: 1, pageSize: BRANCH_OPTIONS_LIMIT },
    signal,
  });
  return result.items.map(({ chiNhanhId, ten }) => ({ chiNhanhId, ten }));
}

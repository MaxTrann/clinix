import { UnexpectedResponseError } from '../../../shared/api/errors';
import type {
  PagedResult,
  ServiceGroupListItem,
} from './service-catalog-types';

// Bộ đọc chặt của `GET /admin/service-groups` (PR3 Admin Catalog). Phản hồi 200 sai hình dạng cùng loại với HTML 502: vẽ dữ liệu dở
// (ô "NaN", cột trống) còn tệ hơn báo lỗi, nên chỗ nào sai cũng ném `UnexpectedResponseError` cho CẢ danh sách. Chỉ chép các khoá cần;
// khoá thừa của API không lọt ra màn hình. Không dùng bộ đọc của `features/booking` (admin không import module khác).
function unusable(): never {
  throw new UnexpectedResponseError(200);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return unusable();
  return value as Record<string, unknown>;
}

// Số nguyên an toàn, không nhỏ hơn `min`: chuỗi "3", số lẻ, NaN, vô cực và số âm đều bị từ chối
function readCount(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    return unusable();
  return value;
}

// Khoá bigint luôn là CHUỖI chữ số (không số 0 đứng đầu): số JSON sẽ mất chính xác từ 2^53
function readId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/u.test(value))
    return unusable();
  return value;
}

function readText(value: unknown): string {
  if (typeof value !== 'string') return unusable();
  return value;
}

function readItem(raw: unknown): ServiceGroupListItem {
  const row = readRecord(raw);
  return {
    nhomDichVuId: readId(row.nhomDichVuId),
    ten: readText(row.ten),
    thuTuHienThi: readCount(row.thuTuHienThi),
    soDichVu: readCount(row.soDichVu),
  };
}

export function readServiceGroupPage(
  raw: unknown,
): PagedResult<ServiceGroupListItem> {
  const body = readRecord(raw);
  if (!Array.isArray(body.items)) return unusable();
  // `map` đọc MỌI dòng: một dòng sai là cả danh sách bị từ chối
  const items = body.items.map(readItem);
  return {
    items,
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
  };
}

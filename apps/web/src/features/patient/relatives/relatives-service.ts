import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import { sortRelatives } from './relative-rules';
import type { Relative, RelativePayload } from './relatives-types';

const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
// BIGINT dương không có số 0 đứng đầu (CAST AS CHAR ở API): `compareIds` so độ dài rồi từ điển nên cần đúng dạng này
const PUBLIC_ID = /^[1-9][0-9]*$/;

const isText = (value: unknown): value is string => typeof value === 'string';

// Kiểm vừa đủ để trang không vỡ (TRACKING F6-C), không tin hơn mức `parseProfile`: bảy khoá sẽ được vẽ ra, khoá khác bỏ qua.
// `moiQuanHe` và `gioiTinh` lạ KHÔNG bị loại: vẫn là chuỗi, trang hiển thị "Chưa cập nhật". Sai kiểu ở đây là trang trắng,
// nên coi như phản hồi không dùng được (cùng loại với HTML 502).
export function parseRelative(raw: unknown): Relative {
  if (typeof raw !== 'object' || raw === null) {
    throw new UnexpectedResponseError(200);
  }
  const {
    hoSoNguoiThanId,
    hoTen,
    moiQuanHe,
    gioiTinh,
    ngaySinh,
    soDienThoai,
    trangThaiHieuLuc,
  } = raw as Record<string, unknown>;
  if (
    !isText(hoSoNguoiThanId) ||
    !PUBLIC_ID.test(hoSoNguoiThanId) ||
    !isText(hoTen) ||
    !isText(moiQuanHe) ||
    !isText(gioiTinh) ||
    !isText(ngaySinh) ||
    !ISO_DATE.test(ngaySinh) ||
    !(soDienThoai === null || isText(soDienThoai)) ||
    typeof trangThaiHieuLuc !== 'boolean'
  ) {
    throw new UnexpectedResponseError(200);
  }
  return {
    hoSoNguoiThanId,
    hoTen,
    moiQuanHe,
    gioiTinh,
    ngaySinh,
    soDienThoai,
    trangThaiHieuLuc,
  };
}

export function parseRelatives(raw: unknown): Relative[] {
  const items =
    typeof raw === 'object' && raw !== null
      ? (raw as { items?: unknown }).items
      : undefined;
  if (!Array.isArray(items)) throw new UnexpectedResponseError(200);
  return items.map(parseRelative);
}

// `signal` tuỳ chọn: tải nền (`refresh`) không huỷ được riêng, kết quả cũ bị bỏ ở hook. Đã sắp theo thứ tự hiển thị.
export async function getRelatives(signal?: AbortSignal): Promise<Relative[]> {
  return sortRelatives(
    parseRelatives(await request<unknown>('/patient/relatives', { signal })),
  );
}

// POST và PUT không truyền `signal`: rời trang giữa lúc lưu không được huỷ yêu cầu (huỷ giữa chừng làm mất thông tin máy chủ đã ghi
// chưa). Đăng xuất vẫn huỷ được vì client gộp tín hiệu của phiên vào mọi yêu cầu. Web không tự thử lại (POST không idempotent).
export async function createRelative(body: RelativePayload): Promise<Relative> {
  return parseRelative(
    await request<unknown>('/patient/relatives', {
      method: 'POST',
      json: body,
    }),
  );
}

// `id` là chuỗi, đi nguyên vẹn vào đường dẫn (id lớn hơn 2^53 sẽ sai chữ số nếu qua `Number`)
export async function updateRelative(
  id: string,
  body: RelativePayload,
): Promise<Relative> {
  return parseRelative(
    await request<unknown>(`/patient/relatives/${id}`, {
      method: 'PUT',
      json: body,
    }),
  );
}

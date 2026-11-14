import { request } from '../../../../shared/api/client';
import {
  readCount,
  readId,
  readList,
  readRecord,
  readText,
} from './response-readers';
import type {
  BranchOption,
  DoctorOption,
  OptionList,
  ServiceOption,
  SpecialtyOption,
} from './filter-option-types';

// Danh sách cho các ô lọc Chuyên khoa và Bác sĩ của các trang lịch hẹn (booking F1 viết, Đại duyệt 12/11/2026, câu (c); chuyển lên common/ ở F8 để Lễ tân dùng lại).
// Gọi bằng client của booking, KHÔNG import `features/search` (`features/` không import chéo). Lỗi tải một danh sách chỉ làm ô lọc đó mất lựa chọn, không chặn bảng.

// `PageQueryDto` của API nhận tối đa 100 mục một trang
const OPTION_PAGE_SIZE = 100;

// Hai route công khai không đọc token: không gắn Authorization và không kích hoạt làm mới phiên khi token cũ hết hạn (như `features/search`)
const PUBLIC_OPTIONS = { skipAuthToken: true } as const;

const byName = (left: string, right: string) => left.localeCompare(right, 'vi');

// Danh sách phân trang: `truncated` khi `total` lớn hơn số mục nhận được, để giao diện ghi "danh sách rút gọn" thay vì cắt âm thầm
function parseOptionPage<T>(
  raw: unknown,
  readItem: (item: Record<string, unknown>) => T,
): OptionList<T> {
  const body = readRecord(raw);
  const options = readList(body.items).map((item) =>
    readItem(readRecord(item)),
  );
  return { options, truncated: readCount(body.total) > options.length };
}

export async function getSpecialtyOptions(
  signal?: AbortSignal,
): Promise<OptionList<SpecialtyOption>> {
  const page = parseOptionPage(
    await request<unknown>('public/specialties', {
      ...PUBLIC_OPTIONS,
      query: { pageSize: OPTION_PAGE_SIZE },
      signal,
    }),
    (item): SpecialtyOption => ({
      chuyenKhoaId: readId(item.chuyenKhoaId),
      ten: readText(item.ten),
    }),
  );
  return {
    ...page,
    options: page.options.sort((a, b) => byName(a.ten, b.ten)),
  };
}

// `bacSiId` công khai chính là `bac_si.tai_khoan_id` = `lich_hen.bac_si_id` (đã kiểm ở `public-doctor.repository.ts`), nên dùng được làm `bacSiId` của B1.
// Chỉ có bác sĩ công khai: bác sĩ đã ngừng hoạt động không có ở đây dù lịch cũ của họ vẫn còn trong lịch sử.
export async function getDoctorOptions(
  signal?: AbortSignal,
): Promise<OptionList<DoctorOption>> {
  const page = parseOptionPage(
    await request<unknown>('public/doctors', {
      ...PUBLIC_OPTIONS,
      query: { pageSize: OPTION_PAGE_SIZE },
      signal,
    }),
    (item): DoctorOption => ({
      bacSiId: readId(item.bacSiId),
      hoTen: readText(item.hoTen),
    }),
  );
  return {
    ...page,
    options: page.options.sort((a, b) => byName(a.hoTen, b.hoTen)),
  };
}

// F10: hai ô lọc của Quản trị viên, cùng cách gọi với hai ô trên (route công khai, không gắn token, `pageSize` 100).
// `public/branches` có phân trang như hai route trên; `public/services` chỉ trả `{ items }` (không phân trang, chỉ dịch vụ ĐANG cung cấp) nên không bao giờ "rút gọn".
export async function getBranchOptions(
  signal?: AbortSignal,
): Promise<OptionList<BranchOption>> {
  const page = parseOptionPage(
    await request<unknown>('public/branches', {
      ...PUBLIC_OPTIONS,
      query: { pageSize: OPTION_PAGE_SIZE },
      signal,
    }),
    (item): BranchOption => ({
      chiNhanhId: readId(item.chiNhanhId),
      ten: readText(item.ten),
    }),
  );
  return {
    ...page,
    options: page.options.sort((a, b) => byName(a.ten, b.ten)),
  };
}

export async function getServiceOptions(
  signal?: AbortSignal,
): Promise<OptionList<ServiceOption>> {
  const body = readRecord(
    await request<unknown>('public/services', { ...PUBLIC_OPTIONS, signal }),
  );
  const options = readList(body.items).map((raw): ServiceOption => {
    const item = readRecord(raw);
    return { dichVuKhamId: readId(item.dichVuKhamId), ten: readText(item.ten) };
  });
  return {
    options: options.sort((a, b) => byName(a.ten, b.ten)),
    truncated: false,
  };
}

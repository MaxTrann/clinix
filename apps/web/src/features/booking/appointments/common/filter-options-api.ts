import { request } from '../../../../shared/api/client';
import {
  readCount,
  readId,
  readList,
  readRecord,
  readText,
} from './response-readers';
import type {
  DoctorOption,
  OptionList,
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

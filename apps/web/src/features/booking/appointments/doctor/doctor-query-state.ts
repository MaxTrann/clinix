import {
  isAppointmentState,
  type AppointmentState,
} from '../common/appointment-status';
import { type DatePreset } from '../common/date-presets';
import { isCalendarDate, isDateRangeValid } from '../common/date-range';
import {
  SHIFT_CODES,
  type ShiftCode,
  type SortOrder,
} from './api/doctor-appointment-types';

// Bộ lọc KHÔNG cá nhân của "Lịch hẹn" của Bác sĩ (booking F11, nhân bản `admin-query-state.ts` của F10: giữ bộ lọc trên URL để quay lại từ trang chi tiết không mất). Hàm thuần: đọc từ và ghi vào
// `URLSearchParams`. CHỈ trạng thái, ca, thứ tự, chip ngày (hay khoảng ngày) và trang nằm trên URL (mã trạng thái, mã ca, ngày: không phải dữ liệu cá nhân); từ khoá `q` (tên, SĐT bệnh nhân) KHÔNG BAO GIỜ lên
// URL hay kho trình duyệt (nếp F1, F8, F10) nên ở bộ nhớ của trang và mất khi quay lại từ chi tiết. Tên khoá URL trùng tên tham số API (riêng `khoang` là chip ngày). URL là dữ liệu NGƯỜI DÙNG SỬA ĐƯỢC:
// mọi giá trị đọc ra đều được kiểm lại, sai dạng thì bỏ như không có. KHÔNG có `bacSiId`, `chiNhanhId`: nếu URL mang chúng thì bị bỏ (không đi tiếp lên API).

export interface DoctorFilters {
  // null = `Tất cả`
  status: AppointmentState | null;
  // null = `Tất cả ca`
  shift: ShiftCode | null;
  sort: SortOrder;
  // Chip ngày. `range` (`Tùy chọn`) là mặc định của Figma `457:2` và dùng `from`, `to` (trống = không lọc ngày); chip khác tính ngày từ hôm nay MỖI LẦN vẽ nên `from`, `to` vô nghĩa
  preset: DatePreset;
  // Khoảng ngày của `range`, ĐÃ ÁP DỤNG lên truy vấn (luôn hợp lệ: đầu trống thì không ràng buộc đầu đó)
  from: string;
  to: string;
  page: number;
}

export const EMPTY_FILTERS: DoctorFilters = {
  status: null,
  shift: null,
  sort: 'MoiNhat',
  preset: 'range',
  from: '',
  to: '',
  page: 1,
};

// Giá trị `khoang` trên URL cho các chip tính theo hôm nay (`range` không có: vắng khoá là `Tùy chọn`) [đề xuất]
const PRESET_SLUGS: Readonly<Record<Exclude<DatePreset, 'range'>, string>> = {
  today: 'hom-nay',
  tomorrow: 'ngay-mai',
  week: 'tuan-nay',
  nextWeek: 'tuan-sau',
  month: 'thang-nay',
};

function presetFromSlug(slug: string): DatePreset {
  for (const [preset, value] of Object.entries(PRESET_SLUGS)) {
    if (value === slug) return preset as DatePreset;
  }
  return 'range';
}

// Trang: số nguyên dương nhiều nhất 5 chữ số (URL tự gõ `page=99999999999` không được đẩy lên API)
const PAGE = /^[1-9][0-9]{0,4}$/;

export function readFilters(params: URLSearchParams): DoctorFilters {
  const status = params.get('trangThai') ?? '';
  const shift = params.get('ca') ?? '';
  const preset = presetFromSlug(params.get('khoang') ?? '');
  const page = params.get('page') ?? '';
  let from = '';
  let to = '';
  if (preset === 'range') {
    const rawFrom = params.get('tuNgay') ?? '';
    const rawTo = params.get('denNgay') ?? '';
    from = isCalendarDate(rawFrom) ? rawFrom : '';
    to = isCalendarDate(rawTo) ? rawTo : '';
    // Đến ngày trước Từ ngày trên URL: bỏ cả hai (không có khoảng nào hợp lệ để áp dụng)
    if (!isDateRangeValid({ from, to })) {
      from = '';
      to = '';
    }
  }
  return {
    status: isAppointmentState(status) ? status : null,
    shift: (SHIFT_CODES as readonly string[]).includes(shift)
      ? (shift as ShiftCode)
      : null,
    sort: params.get('sapXep') === 'CuNhat' ? 'CuNhat' : 'MoiNhat',
    preset,
    from,
    to,
    page: PAGE.test(page) ? Number(page) : 1,
  };
}

// Chỉ ghi khoá KHÁC mặc định, thứ tự cố định: hai bộ lọc bằng nhau cho đúng cùng một chuỗi (so sánh để biết có đổi không)
export function writeFilters(filters: DoctorFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: [string, string][] = [
    ['trangThai', filters.status ?? ''],
    ['ca', filters.shift ?? ''],
    ['sapXep', filters.sort === 'CuNhat' ? 'CuNhat' : ''],
    ['khoang', filters.preset === 'range' ? '' : PRESET_SLUGS[filters.preset]],
    ['tuNgay', filters.preset === 'range' ? filters.from : ''],
    ['denNgay', filters.preset === 'range' ? filters.to : ''],
    ['page', filters.page > 1 ? String(filters.page) : ''],
  ];
  for (const [key, value] of entries) {
    if (value !== '') params.set(key, value);
  }
  return params;
}

// Có bộ lọc NGOÀI ngày đang áp dụng không (trạng thái, ca, từ khoá): phân biệt "không có lịch nào trong khoảng ngày đã chọn" với "không có lịch khớp bộ lọc". Thứ tự sắp xếp không lọc bớt dòng nào.
export function hasNonDateFilters(filters: DoctorFilters, q: string): boolean {
  return filters.status !== null || filters.shift !== null || q !== '';
}

// Có gì khác mặc định không (không tính trang): hiện nút `Xóa lọc`
export function hasActiveFilters(filters: DoctorFilters, q: string): boolean {
  return (
    hasNonDateFilters(filters, q) ||
    filters.sort !== 'MoiNhat' ||
    filters.preset !== 'range' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

import {
  isAppointmentState,
  type AppointmentState,
} from '../common/appointment-status';
import {
  PRESET_SLUGS,
  presetFromSlug,
  type DatePreset,
} from '../common/date-presets';
import { isCalendarDate, isDateRangeValid } from '../common/date-range';
import { DATE_PRESETS } from './date-presets';

// Bộ lọc KHÔNG cá nhân của "Quản lý lịch hẹn" của Lễ tân (booking F12b; F8 để ở bộ nhớ trang, F12b đưa lên URL như `admin-query-state.ts` của F10 và `doctor-query-state.ts` của F11:
// trang chi tiết Lễ tân giờ là TRANG riêng nên quay lại danh sách không được mất bộ lọc; Đại duyệt 14/11/2026, TRACKING 3.42 câu (h)). Hàm thuần: đọc từ và ghi vào `URLSearchParams`.
// CHỈ chip ngày (hay khoảng ngày), trạng thái, chuyên khoa, bác sĩ và trang nằm trên URL (mã trạng thái, id số, ngày: không phải dữ liệu cá nhân); từ khoá `q` (tên, SĐT bệnh nhân) KHÔNG
// BAO GIỜ lên URL hay kho trình duyệt (nếp F1, F8) nên ở bộ nhớ của trang và mất khi quay lại từ chi tiết. Tên khoá URL trùng tên tham số API (riêng `khoang` là chip ngày, như Bác sĩ).
// URL là dữ liệu NGƯỜI DÙNG SỬA ĐƯỢC: mọi giá trị đọc ra đều được kiểm lại, sai dạng thì bỏ như không có.
export interface ReceptionFilters {
  // Chip ngày. Mặc định của Figma `479:2` là `today`. Chip khác `range` tính ngày từ `todayVn()` MỖI LẦN vẽ (URL lưu TÊN chip, không lưu ngày) nên qua nửa đêm hay mở lại hôm sau vẫn đúng
  preset: DatePreset;
  // Khoảng ngày của `range` ĐÃ ÁP DỤNG lên truy vấn (luôn hợp lệ: đầu trống thì không ràng buộc đầu đó); vô nghĩa với chip khác
  from: string;
  to: string;
  // null = `Tất cả trạng thái`
  status: AppointmentState | null;
  // '' = `Tất cả bác sĩ`, `Tất cả chuyên khoa`
  doctor: string;
  specialty: string;
  page: number;
}

export const EMPTY_FILTERS: ReceptionFilters = {
  preset: 'today',
  from: '',
  to: '',
  status: null,
  doctor: '',
  specialty: '',
  page: 1,
};

// Giá trị `khoang` của chip `Khoảng ngày` [đề xuất]: Lễ tân mặc định là `today` (vắng khoá), nên `range` cần slug riêng (Bác sĩ thì ngược lại). Các chip còn lại dùng `PRESET_SLUGS` chung.
const RANGE_SLUG = 'khoang-ngay';

// Bốn chip của Lễ tân (Figma `479:2`); slug của chip Bác sĩ (`tuan-sau`, `thang-nay`) gõ vào URL Lễ tân thì bị bỏ như slug lạ
const ALLOWED_PRESETS: readonly DatePreset[] = DATE_PRESETS.map(
  (option) => option.id,
);

function readPreset(slug: string): DatePreset {
  if (slug === RANGE_SLUG) return 'range';
  const preset = presetFromSlug(slug, EMPTY_FILTERS.preset);
  return ALLOWED_PRESETS.includes(preset) ? preset : EMPTY_FILTERS.preset;
}

function presetSlug(preset: DatePreset): string {
  if (preset === EMPTY_FILTERS.preset) return '';
  return preset === 'range' ? RANGE_SLUG : PRESET_SLUGS[preset];
}

// Id BIGINT dạng chuỗi số dương không có số 0 đứng đầu (như `readId`): giữ chuỗi, KHÔNG bao giờ `Number`
const ID = /^[1-9][0-9]*$/;
// Trang: số nguyên dương nhiều nhất 5 chữ số `[đề xuất]` (URL tự gõ `page=99999999999` không được đẩy lên API)
const PAGE = /^[1-9][0-9]{0,4}$/;

export function readFilters(params: URLSearchParams): ReceptionFilters {
  const id = (key: string) => {
    const value = params.get(key) ?? '';
    return ID.test(value) ? value : '';
  };
  const preset = readPreset(params.get('khoang') ?? '');
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
  const status = params.get('trangThai') ?? '';
  const page = params.get('page') ?? '';
  return {
    preset,
    from,
    to,
    status: isAppointmentState(status) ? status : null,
    doctor: id('bacSiId'),
    specialty: id('chuyenKhoaId'),
    page: PAGE.test(page) ? Number(page) : 1,
  };
}

// Chỉ ghi khoá KHÁC mặc định, thứ tự cố định: hai bộ lọc bằng nhau cho đúng cùng một chuỗi (so sánh để biết có đổi không). `tuNgay`, `denNgay` chỉ ghi khi chip là `range`.
export function writeFilters(filters: ReceptionFilters): URLSearchParams {
  const params = new URLSearchParams();
  const isRange = filters.preset === 'range';
  const entries: [string, string][] = [
    ['khoang', presetSlug(filters.preset)],
    ['tuNgay', isRange ? filters.from : ''],
    ['denNgay', isRange ? filters.to : ''],
    ['trangThai', filters.status ?? ''],
    ['chuyenKhoaId', filters.specialty],
    ['bacSiId', filters.doctor],
    ['page', filters.page > 1 ? String(filters.page) : ''],
  ];
  for (const [key, value] of entries) {
    if (value !== '') params.set(key, value);
  }
  return params;
}

// Có bộ lọc nào KHÁC chip ngày đang áp dụng không (kể cả từ khoá): phân biệt "không có lịch nào trong ngày đã chọn" với "không có lịch khớp bộ lọc"
export function hasNonDateFilters(
  filters: ReceptionFilters,
  q: string,
): boolean {
  return (
    filters.status !== null ||
    filters.doctor !== '' ||
    filters.specialty !== '' ||
    q !== ''
  );
}

// Có gì khác mặc định không (không tính trang): hiện nút `Xóa lọc` (Figma `494:2`; `479:2` ở mặc định không có nút này). Chip khác `Hôm nay` cũng là "đang lọc".
export function hasActiveFilters(
  filters: ReceptionFilters,
  q: string,
): boolean {
  return (
    filters.preset !== EMPTY_FILTERS.preset || hasNonDateFilters(filters, q)
  );
}

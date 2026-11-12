import type { AppointmentState } from '../common/appointment-status';

// Bộ lọc và trang của "Lịch hẹn của tôi" (booking F1), gom MỘT chỗ để quy tắc "đổi bộ lọc thì về trang 1" không thể bị bỏ sót ở một ô nào.
// Chỉ ở bộ nhớ của trang: không `localStorage`, `sessionStorage` và không đưa vào URL (`q` có thể là mã lịch hay tên người thân; Đại duyệt 12/11/2026).

export interface DateRange {
  from: string;
  to: string;
}

export interface ListQueryState {
  // Thẻ lọc đang chọn; null = `Tất cả`
  status: AppointmentState | null;
  // '' = `Tất cả`; ngoài ra là `BanThan` hoặc id hồ sơ người thân
  profile: string;
  doctor: string;
  specialty: string;
  // Chữ trong hai ô ngày (có thể đang sai thứ tự) và khoảng ĐÃ ÁP DỤNG lên truy vấn (luôn hợp lệ): ô sai thứ tự thì không gọi API
  dateInput: DateRange;
  dates: DateRange;
  // Từ khoá đã chuẩn hoá và đã áp dụng ('' = chưa tìm)
  q: string;
  page: number;
}

export const INITIAL_QUERY: ListQueryState = {
  status: null,
  profile: '',
  doctor: '',
  specialty: '',
  dateInput: { from: '', to: '' },
  dates: { from: '', to: '' },
  q: '',
  page: 1,
};

// Ngày là chuỗi `YYYY-MM-DD` nên so sánh chuỗi chính là so sánh ngày; ô trống thì không ràng buộc
export function isDateRangeValid(range: DateRange): boolean {
  return range.from === '' || range.to === '' || range.to >= range.from;
}

export type QueryAction =
  | { type: 'status'; value: AppointmentState | null }
  | { type: 'profile' | 'doctor' | 'specialty' | 'keyword'; value: string }
  | { type: 'from' | 'to'; value: string }
  | { type: 'page'; value: number }
  | { type: 'reset' };

export function queryReducer(
  state: ListQueryState,
  action: QueryAction,
): ListQueryState {
  switch (action.type) {
    // Chỉ chuyển trang mới KHÔNG về trang 1
    case 'page':
      return action.value === state.page
        ? state
        : { ...state, page: action.value };
    case 'reset':
      return INITIAL_QUERY;
    case 'status':
      return { ...state, status: action.value, page: 1 };
    case 'profile':
      return { ...state, profile: action.value, page: 1 };
    case 'doctor':
      return { ...state, doctor: action.value, page: 1 };
    case 'specialty':
      return { ...state, specialty: action.value, page: 1 };
    case 'keyword':
      // Cùng từ khoá thì không làm gì: không về trang 1 và không gọi lại API
      return action.value === state.q
        ? state
        : { ...state, q: action.value, page: 1 };
    case 'from':
    case 'to': {
      const dateInput = { ...state.dateInput, [action.type]: action.value };
      return isDateRangeValid(dateInput)
        ? { ...state, dateInput, dates: dateInput, page: 1 }
        : { ...state, dateInput };
    }
  }
}

// Có bộ lọc hay từ khoá nào ĐANG ÁP DỤNG không: phân biệt "chưa có lịch nào" với "không có lịch khớp bộ lọc"
export function hasActiveFilters(state: ListQueryState): boolean {
  return (
    state.status !== null ||
    state.profile !== '' ||
    state.doctor !== '' ||
    state.specialty !== '' ||
    state.dates.from !== '' ||
    state.dates.to !== '' ||
    state.q !== ''
  );
}

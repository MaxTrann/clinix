import type { AppointmentState } from '../common/appointment-status';
import { isDateRangeValid, type DateRange } from '../common/date-range';
import type { DatePreset } from './date-presets';

// Bộ lọc và trang của "Quản lý lịch hẹn" của Lễ tân (booking F8), gom MỘT chỗ để quy tắc "đổi bộ lọc thì về trang 1" không thể bị bỏ sót ở một ô nào.
// Chỉ ở bộ nhớ của trang: không `localStorage`, `sessionStorage` và không đưa vào URL (`q` có thể là SĐT hay tên bệnh nhân; nếp F1).

export interface ReceptionQueryState {
  // Chip ngày đang chọn. Ngày của `today`, `tomorrow`, `week` KHÔNG nằm ở đây: tính mỗi lần vẽ từ `todayVn()` để qua nửa đêm trang tự sang ngày mới
  preset: DatePreset;
  // Ô `Tất cả trạng thái`; null = tất cả
  status: AppointmentState | null;
  // '' = `Tất cả bác sĩ`, `Tất cả chuyên khoa`
  doctor: string;
  specialty: string;
  // Chữ trong hai ô ngày của `Khoảng ngày` (có thể đang sai thứ tự) và khoảng ĐÃ ÁP DỤNG lên truy vấn (luôn hợp lệ): ô sai thứ tự thì không gọi API
  dateInput: DateRange;
  dates: DateRange;
  // Từ khoá đã chuẩn hoá và đã áp dụng ('' = chưa tìm)
  q: string;
  page: number;
}

// Mặc định của Figma `479:2`: chip `Hôm nay`, mọi bộ lọc `Tất cả`
export const INITIAL_QUERY: ReceptionQueryState = {
  preset: 'today',
  status: null,
  doctor: '',
  specialty: '',
  dateInput: { from: '', to: '' },
  dates: { from: '', to: '' },
  q: '',
  page: 1,
};

export type QueryAction =
  | { type: 'preset'; value: DatePreset }
  | { type: 'status'; value: AppointmentState | null }
  | { type: 'doctor' | 'specialty' | 'keyword'; value: string }
  | { type: 'from' | 'to'; value: string }
  | { type: 'page'; value: number }
  | { type: 'reset' };

export function queryReducer(
  state: ReceptionQueryState,
  action: QueryAction,
): ReceptionQueryState {
  switch (action.type) {
    // Chỉ chuyển trang mới KHÔNG về trang 1
    case 'page':
      return action.value === state.page
        ? state
        : { ...state, page: action.value };
    case 'reset':
      return INITIAL_QUERY;
    // Bấm lại chip đang chọn không làm gì: không về trang 1 và không gọi lại API
    case 'preset':
      return action.value === state.preset
        ? state
        : { ...state, preset: action.value, page: 1 };
    case 'status':
      return { ...state, status: action.value, page: 1 };
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

// Có bộ lọc nào KHÁC chip ngày đang áp dụng không: phân biệt "không có lịch nào trong ngày đã chọn" với "không có lịch khớp bộ lọc"
export function hasNonDateFilters(state: ReceptionQueryState): boolean {
  return (
    state.status !== null ||
    state.doctor !== '' ||
    state.specialty !== '' ||
    state.q !== ''
  );
}

// Có gì khác mặc định không: hiện nút `Xóa lọc` (Figma `494:2`; `479:2` ở mặc định không có nút này). Chip khác `Hôm nay` cũng là "đang lọc".
export function hasActiveFilters(state: ReceptionQueryState): boolean {
  return state.preset !== 'today' || hasNonDateFilters(state);
}

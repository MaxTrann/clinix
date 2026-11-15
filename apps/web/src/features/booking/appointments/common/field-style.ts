// Chiều cao và kiểu ô nhập, ô chọn của các trang danh sách lịch hẹn (booking F12b, UI-10). Tách khỏi `filter-controls.tsx` vì quy tắc `react-refresh/only-export-components`: file component chỉ xuất component.
//
// Chiều cao theo Figma của TỪNG màn (Đại chọn "theo Figma từng màn" 15/11/2026, TRACKING 3.44 câu (b)): mỗi màn Figma dùng một số khác nhau, nên một giá trị chung không tồn tại. `html` đặt gốc 15 px nên
// `h-11` = 41,25 px, `h-9.5` = 35,6 px (số `rem` tuỳ ý chia 16 là lỗi cũ của F8 đến F11). Mặc định `standard` khớp Bệnh nhân (`411:175`) và Bác sĩ (`457:163`); Admin và Lễ tân truyền riêng.
export const FIELD_HEIGHT = {
  // Bệnh nhân `411:175`, `411:183`; Bác sĩ `457:163`, `457:197`: 41,2 px
  standard: 'h-11',
  // Admin `511:319` (ô tìm), `511:324`, `511:328` (ngày): 35,4 px
  adminInput: 'h-9.5',
  // Admin `511:333` đến `511:370` (ô chọn): 34,2 px
  adminSelect: 'h-9',
  // Lễ tân `494:174` (ô tìm): 39,1 px
  receptionSearch: 'h-[2.6rem]',
  // Lễ tân `494:214` (ô ngày): 31,6 px
  receptionDate: 'h-8.5',
  // Lễ tân `494:188` (ô chọn gọn): 28,1 px
  receptionCompact: 'h-7.5',
} as const;

const FIELD_BASE =
  'block w-full rounded-xl border border-gray-500 bg-white px-3 text-sm text-gray-900';

// Kiểu ô nhập, ô chọn với chiều cao cho trước (mặc định: chiều cao của Bệnh nhân, Bác sĩ)
export const fieldControl = (height: string = FIELD_HEIGHT.standard) =>
  `${height} ${FIELD_BASE}`;

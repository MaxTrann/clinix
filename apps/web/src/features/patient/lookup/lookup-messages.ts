import { ApiError } from '../../../shared/api/errors';

// Câu chữ của trang tra cứu (patient F8; TRACKING F8-B, F8-E). Câu bám Figma `483:2`, `505:2` khi có; câu còn lại theo PLAN 5.9 hoặc
// `[đề xuất]` (Figma chưa có frame: đang tìm, lỗi, từ khoá không hợp lệ, "Quay lại danh sách").
export const LOOKUP_TEXT = {
  // Figma `483:2`: chữ mờ trong ô; tên truy cập của ô cùng nội dung, bỏ dấu ba chấm
  searchPlaceholder: 'Tìm theo họ tên, số điện thoại hoặc email...',
  searchLabel: 'Tìm theo họ tên, số điện thoại hoặc email',
  clearSearch: 'Xóa tìm kiếm',
  // PLAN 5.9 `TU_KHOA_KHONG_HOP_LE`
  keywordTooShort: 'Nhập ít nhất 2 ký tự để tìm kiếm.',
  keywordTooLong: 'Từ khoá tối đa 100 ký tự.',
  keywordInvalid: 'Từ khoá có ký tự không hợp lệ.',
  idleTitle: 'Nhập tên, số điện thoại hoặc email để tra cứu',
  searching: 'Đang tìm...',
  // Figma `505:2`
  notFoundTitle: 'Không tìm thấy bệnh nhân',
  notFoundHint: 'Thử tìm với từ khoá khác',
  // Figma `483:2`
  selectPrompt: 'Chọn một bệnh nhân để xem hồ sơ',
  loadingDetail: 'Đang tải hồ sơ...',
  // PLAN 5.9: `KHONG_TIM_THAY` ở trang tra cứu
  detailNotFound: 'Không tìm thấy bệnh nhân.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  resultsRegion: 'Kết quả tìm kiếm',
  detailRegion: 'Hồ sơ bệnh nhân',
  backToList: 'Quay lại danh sách',
  noRelatives: 'Chưa có hồ sơ người thân.',
} as const;

export function resultCountLabel(total: number): string {
  return `${total} kết quả`;
}

export function relativeCountLabel(count: number): string {
  return `${count} người`;
}

// Câu theo MÃ lỗi (không theo mã HTTP hay `thongBao`, CODING_CONVENTION). `null` ⇒ lỗi chung (mạng, quá giờ, 5xx, phản hồi lạ): nơi gọi
// dùng `ErrorState` kèm "Thử lại". Ba mã có câu riêng đều KHÔNG nên thử lại (cùng yêu cầu sẽ cùng kết quả).
export function lookupErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.maLoi === 'KHONG_DU_QUYEN') return LOOKUP_TEXT.forbidden;
  if (error.maLoi === 'KHONG_TIM_THAY') return LOOKUP_TEXT.detailNotFound;
  if (
    error.maLoi === 'DU_LIEU_KHONG_HOP_LE' &&
    error.loi?.some((item) => item.ma === 'TU_KHOA_KHONG_HOP_LE')
  ) {
    return LOOKUP_TEXT.keywordTooShort;
  }
  return null;
}

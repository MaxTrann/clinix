// Mã lỗi và hằng của module patient (PLAN patient mục 5.8, 5.9; TRACKING patient P1-E). Frontend chọn thông báo theo MÃ, không theo câu chữ.
// Mã dùng chung (KHONG_TIM_THAY, KHONG_DU_QUYEN, PHIEN_HET_HIEU_LUC, TRUONG_KHONG_DUOC_PHEP, DU_LIEU_KHONG_HOP_LE, HO_TEN_KHONG_HOP_LE,
// SDT_KHONG_HOP_LE) đã có ở common/errors và auth: không khai lại ở đây.

// Mã của MỘT trường: `ma` trong loi[{truong, ma}] của lỗi 400 DU_LIEU_KHONG_HOP_LE
export const PATIENT_FIELD_ERROR_CODES = {
  INVALID_BIRTH_DATE: 'NGAY_SINH_KHONG_HOP_LE', // [đề xuất] Q7
  INVALID_GENDER: 'GIOI_TINH_KHONG_HOP_LE', // [đề xuất] Q3
  INVALID_ADDRESS: 'DIA_CHI_KHONG_HOP_LE', // [đề xuất] Q8
  INVALID_RELATIONSHIP: 'MOI_QUAN_HE_KHONG_HOP_LE', // [đề xuất] Q15
  INVALID_KEYWORD: 'TU_KHOA_KHONG_HOP_LE', // [đề xuất] Q19: mã trường của `q` khi tra cứu (B6)
} as const;

// Mã nghiệp vụ, trả bằng AppException(409, …)
export const PATIENT_ERROR_CODES = {
  RELATIVE_HAS_ACTIVE_APPOINTMENTS: 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN', // B5 (Q11)
  RELATIVE_DEACTIVATED: 'HO_SO_NGUOI_THAN_DA_NGUNG', // B4 (Q9)
} as const;

export type PatientErrorCode =
  (typeof PATIENT_ERROR_CODES)[keyof typeof PATIENT_ERROR_CODES];

// `thongBao` [đề xuất] của PLAN 5.9, chỉ để người đọc và log; frontend không dựa vào câu này
export const PATIENT_ERROR_MESSAGES: Record<PatientErrorCode, string> = {
  HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN:
    'Không thể ngừng sử dụng hồ sơ này vì đang có lịch hẹn chưa hoàn tất. Vui lòng hủy các lịch hẹn dưới đây trước.',
  HO_SO_NGUOI_THAN_DA_NGUNG:
    'Hồ sơ người thân này đã ngừng sử dụng nên không thể chỉnh sửa.',
};

// Từ khoá tra cứu hồ sơ bệnh nhân (Q19, B6): sau khi cắt khoảng trắng dài 2–100 ký tự
export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 100;

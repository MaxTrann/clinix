// Thân và kết quả của `POST /doctor/appointments/:maLichHen/complete` (doctor-exam B1; PLAN 5.4, 5.11; Q5).

/**
 * Thân PHẢI RỖNG: lớp không có trường nào, nên `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) từ chối mọi khoá gửi lên (`bacSiId`, `lichHenId`…) bằng
 * 400 `DU_LIEU_KHONG_HOP_LE` kèm `loi[{ truong, ma: 'TRUONG_KHONG_DUOC_PHEP' }]`. Bác sĩ chỉ lấy từ access token, không từ thân (QHK-02).
 */
export class ExamCompleteDto {}

/** 200: đúng hai khoá (PLAN 5.11). `maLichHen` là mã chuẩn trong DB. */
export interface ExamCompletionResult {
  maLichHen: string;
  trangThai: 'HoanThanh';
}

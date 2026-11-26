import { Allow } from 'class-validator';

// Dữ liệu vào của API gửi tin (chat B3; PLAN chat 5.6).
/**
 * Thân gửi tin bằng JSON (PLAN 5.6). `@Allow()` CHỈ để hai khoá này qua được `whitelist`/`forbidNonWhitelisted` (trường lạ như `taiKhoanId`, `chiNhanhId`
 * ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`, QCH-09); kiểu, độ dài, ký tự, dạng UUID do lõi gửi kiểm (HCH-04: không chép luật sang DTO).
 */
export class SendMessageDto {
  @Allow()
  noiDung?: unknown;

  @Allow()
  maGui?: unknown;
}

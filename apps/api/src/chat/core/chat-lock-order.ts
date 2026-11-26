// Tầng khoá của chat (chat B1; PLAN chat 5.4, T5). THÊM vào giữa tầng 1 và 7c của bảng khoá toàn cục booking (`appointments/locking/lock-order.ts`),
// không sửa file đó. Mọi luồng ghi chạy trong `withBookingTransaction` (READ COMMITTED, thử lại 1213/1205 hai lần, chờ khoá 3 giây).
//
//   Tầng  Bảng                     Mở hội thoại + tin đầu          Gửi vào hội thoại đã có          Đánh dấu đã đọc (B2)
//   1     tai_khoan (Bệnh nhân)    FOR UPDATE (câu ĐẦU TIÊN)       KHÔNG                            không
//   C1    hoi_thoai                hàng mới chèn                   FOR UPDATE theo khoá chính       FOR SHARE theo khoá chính
//   C2    tin_nhan                 INSERT                          INSERT                           chỉ đọc
//   C3    tai_khoan_hoi_thoai      INSERT thành viên               dòng của Lễ tân nếu chưa có      upsert mốc
//   7c    thong_bao                INSERT nếu chưa có (B6)         INSERT nếu chưa có (B6)          UPDATE đã đọc
//
// Hai luật làm nên an toàn (đã đo ở X1 M5, M6: 0 lần 1213, 1205, 503):
//  - Luồng mở thấy hội thoại ĐÃ CÓ thì kết thúc giao dịch ngay, KHÔNG khoá hội thoại đó khi đang giữ khoá tài khoản: luồng gửi giữ `hoi_thoai` X rồi cần S trên
//    tài khoản Bệnh nhân (khoá ngoại của `tin_nhan`, `thong_bao`), nên giữ tài khoản rồi chờ hội thoại sẽ thành chu trình (LOI-18).
//  - Luồng gửi KHÔNG khoá tài khoản người gửi (cùng lý do); vì thế giới hạn tốc độ là giới hạn MỀM giữa các hội thoại khác nhau (T6).
export const CHAT_LOCK_ORDER = [
  { tang: '1', bang: ['tai_khoan'] },
  { tang: 'C1', bang: ['hoi_thoai'] },
  { tang: 'C2', bang: ['tin_nhan'] },
  { tang: 'C3', bang: ['tai_khoan_hoi_thoai'] },
  { tang: '7c', bang: ['thong_bao'] },
] as const;

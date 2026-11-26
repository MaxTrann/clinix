import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Thành viên của hội thoại kèm mốc đã đọc (chat P1). Khóa chính kép (tài khoản, hội thoại). Hộp thư chung Lễ tân: mỗi Lễ tân có dòng riêng, tạo khi mở hay trả lời lần đầu.
// Tin chưa đọc = tin có `tin_nhan_id` lớn hơn mốc (hay mọi tin nếu mốc trống) và người gửi khác chính mình. Mốc phải thuộc cùng hội thoại: service kiểm (quy tắc nghiệp vụ 14).
@Entity({ name: 'tai_khoan_hoi_thoai' })
@Index('tai_khoan_hoi_thoai_index_27', ['hoiThoaiId', 'taiKhoanId'])
export class TaiKhoanHoiThoai {
  @PrimaryColumn({ name: 'tai_khoan_id', type: 'bigint' })
  taiKhoanId!: string;

  @PrimaryColumn({ name: 'hoi_thoai_id', type: 'bigint' })
  hoiThoaiId!: string;

  /** Tin mới nhất người này đã đọc; `null` = chưa đọc gì. */
  @Column({ name: 'tin_nhan_cuoi_da_doc_id', type: 'bigint', nullable: true })
  tinNhanCuoiDaDocId!: string | null;
}

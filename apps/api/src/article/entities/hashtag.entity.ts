import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Một thẻ (hashtag) của bài viết (article B1; PLAN article 5.6, T6). `ten` đã chuẩn hoá chữ thường ở service.
// UNIQUE `ten` theo collation `utf8mb4_unicode_ci`: KHÔNG phân biệt hoa thường và dấu (như quy tắc 41 của chuyên khoa), nên "mắt" và "mặt" trùng nhau ở DB;
// service so tên đọc về với tên đã chuẩn hoá để báo 409 `THE_TRUNG_KHONG_DAU` (kết quả đo thật ở ABD-04).
@Entity({ name: 'hashtag' })
@Index('ten', ['ten'], { unique: true })
export class Hashtag {
  @PrimaryGeneratedColumn({ name: 'hashtag_id', type: 'bigint' })
  hashtagId!: string;

  @Column({ name: 'ten', type: 'varchar', length: 50 })
  ten!: string;

  /** Không có màn quản lý thẻ: cột chỉ đổi bằng tay ở DB; thẻ tắt thì không gắn mới được (409 `THE_DA_TAT`). */
  @Column({ name: 'trang_thai_hoat_dong', type: 'boolean', default: true })
  trangThaiHoatDong!: boolean;
}

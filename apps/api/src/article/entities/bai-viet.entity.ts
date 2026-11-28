import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TRANG_THAI_BAI_VIET, type TrangThaiBaiViet } from './enums.js';

// Một bài viết / cẩm nang sức khỏe (article B1; PLAN article 5.2, 5.3). Khoá ngoại `tac_gia_id` là cột thuần (khoá ngoại thật nằm ở DB, do migration tạo; synchronize: false).
// `bai_viet` KHÔNG có chỉ mục nào ngoài khoá chính và khoá ngoại (5.10: đo ở X1 rồi mới hỏi Đại có thêm không).
// Nội dung là chữ thuần, lưu nguyên văn (không lọc HTML): mọi nơi dùng phải tự coi là chữ thuần.
@Entity({ name: 'bai_viet' })
export class BaiViet {
  @PrimaryGeneratedColumn({ name: 'bai_viet_id', type: 'bigint' })
  baiVietId!: string;

  /** Tài khoản Quản trị viên tạo bài (từ token, đặt một lần, không đổi khi người khác sửa). */
  @Column({ name: 'tac_gia_id', type: 'bigint' })
  tacGiaId!: string;

  @Column({ name: 'tieu_de', type: 'varchar', length: 255 })
  tieuDe!: string;

  @Column({ name: 'mo_ta_ngan', type: 'varchar', length: 500, nullable: true })
  moTaNgan!: string | null;

  @Column({ name: 'noi_dung', type: 'text' })
  noiDung!: string;

  /** Luôn NULL ở article B1 (ảnh đại diện làm ở B4, đọc qua `anh_tai_len`). */
  @Column({
    name: 'anh_dai_dien',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  anhDaiDien!: string | null;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_BAI_VIET,
    default: 'BanNhap',
  })
  trangThai!: TrangThaiBaiViet;

  /** NULL cho tới lần đầu sang `DaXuatBan`; đặt MỘT lần, về sau giữ nguyên (MH3). */
  @Column({ name: 'thoi_diem_xuat_ban', type: 'datetime', nullable: true })
  thoiDiemXuatBan!: Date | null;

  @Column({
    name: 'thoi_diem_tao',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  thoiDiemTao!: Date;

  @Column({
    name: 'cap_nhat_lan_cuoi',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  capNhatLanCuoi!: Date;
}

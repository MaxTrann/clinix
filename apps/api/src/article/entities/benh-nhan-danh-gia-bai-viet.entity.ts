import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { LOAI_DANH_GIA_BAI_VIET, type LoaiDanhGiaBaiViet } from './enums.js';

// Phiếu đánh giá Thích / Không thích của một Bệnh nhân cho một bài (article B1 tạo bảng; mã dùng bảng này là B3). Mỗi tài khoản một phiếu cho mỗi bài: khoá chính kép.
// Phiếu GIỮ NGUYÊN khi bài bị ẩn (2.4.55 A2 3c). Chỉ mục `(bai_viet_id, loai)` phục vụ đếm theo loại (PLAN article 5.10).
@Entity({ name: 'benh_nhan_danh_gia_bai_viet' })
@Index('benh_nhan_danh_gia_bai_viet_index_24', ['baiVietId', 'loai'])
export class BenhNhanDanhGiaBaiViet {
  @PrimaryColumn({ name: 'benh_nhan_id', type: 'bigint' })
  benhNhanId!: string;

  @PrimaryColumn({ name: 'bai_viet_id', type: 'bigint' })
  baiVietId!: string;

  @Column({ name: 'loai', type: 'enum', enum: LOAI_DANH_GIA_BAI_VIET })
  loai!: LoaiDanhGiaBaiViet;
}

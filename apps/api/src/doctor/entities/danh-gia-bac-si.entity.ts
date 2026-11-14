import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Đánh giá bác sĩ sau một lịch hẹn đã Hoàn thành (doctor-exam; mỗi lịch tối đa một đánh giá: UNIQUE lich_hen_id). Bác sĩ và bệnh nhân
// suy ra qua lich_hen (bảng này không có bac_si_id, benh_nhan_id). Người ẩn và thời điểm ẩn nằm trong nhat_ky_hanh_dong (AnDanhGia),
// không nằm ở đây. Khóa ngoại `lichHenId` là cột thuần (khóa ngoại thật nằm ở DB, do migration tạo; synchronize: false).
// Hai CHECK giữ số sao 1 đến 5 và cặp (biAn, lyDoAn): chưa ẩn thì không có lý do, đã ẩn thì bắt buộc có lý do.
@Entity({ name: 'danh_gia_bac_si' })
@Index('lich_hen_id', ['lichHenId'], { unique: true })
@Check('chk_danh_gia_so_sao', '`so_sao` BETWEEN 1 AND 5')
@Check(
  'chk_danh_gia_an',
  '(`bi_an` = 0 AND `ly_do_an` IS NULL) OR (`bi_an` = 1 AND `ly_do_an` IS NOT NULL)',
)
export class DanhGiaBacSi {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'danh_gia_bac_si_id' })
  danhGiaBacSiId!: string;

  @Column({ name: 'lich_hen_id', type: 'bigint' })
  lichHenId!: string;

  @Column({ name: 'so_sao', type: 'tinyint' })
  soSao!: number;

  @Column({ name: 'nhan_xet', type: 'text', nullable: true })
  nhanXet!: string | null;

  @Column({ name: 'bi_an', type: 'boolean', default: false })
  biAn!: boolean;

  @Column({ name: 'ly_do_an', type: 'varchar', length: 255, nullable: true })
  lyDoAn!: string | null;

  // Không có mặc định ở DB: service ghi `toSecond(nowVN())` (không dùng NOW(): giờ nghiệp vụ là giờ Việt Nam).
  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}

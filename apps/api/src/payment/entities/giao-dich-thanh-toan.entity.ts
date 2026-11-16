import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  LOAI_GIAO_DICH_THANH_TOAN,
  PHUONG_THUC_THANH_TOAN,
  TRANG_THAI_DOI_SOAT,
  TRANG_THAI_GIAO_DICH_THANH_TOAN,
} from './payment-enums.js';
import type {
  LoaiGiaoDichThanhToan,
  PhuongThucThanhToan,
  TrangThaiDoiSoat,
  TrangThaiGiaoDichThanhToan,
} from './payment-enums.js';

// Giao dịch thanh toán (payment): nạp ví qua cổng (`NapVi`), thanh toán cọc lịch hẹn bằng ví hoặc thu tiền mặt tại quầy (`ThanhToanLichHen`).
// `lichHenId` trỏ LỊCH GỐC của chuỗi đổi lịch. Các khóa ngoại (`viNoiBoId`, `lichHenId`, `nguoiThuId`) là cột thuần: khóa ngoại thật nằm ở DB do
// migration tạo (synchronize: false). `soTien` là decimal(12,2) nên TypeORM trả CHUỖI, không đổi sang number (mất độ chính xác tiền).
// DB không chặn `ThanhToanLichHen` bằng VNPay/MoMo hay `NapVi` bằng Vi/TienMatTaiQuay: service chặn.
@Entity({ name: 'giao_dich_thanh_toan' })
@Index('giao_dich_thanh_toan_index_16', ['phuongThuc', 'maGiaoDichCong'], {
  unique: true,
})
@Index('giao_dich_thanh_toan_index_17', ['viNoiBoId', 'thoiDiemTao'])
@Index('giao_dich_thanh_toan_index_18', ['trangThai', 'thoiDiemTao'])
@Index('giao_dich_thanh_toan_index_19', ['trangThaiDoiSoat'])
@Check(
  'chk_gd_thanh_toan_loai',
  "(`loai` = 'NapVi' AND `lich_hen_id` IS NULL AND `vi_noi_bo_id` IS NOT NULL) OR (`loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL)",
)
@Check(
  'chk_gd_tien_mat_nguoi_thu',
  "(`phuong_thuc` = 'TienMatTaiQuay' AND `loai` = 'ThanhToanLichHen' AND `lich_hen_id` IS NOT NULL AND `vi_noi_bo_id` IS NULL AND `ma_giao_dich_cong` IS NULL AND `so_tien` > 0 AND `trang_thai` = 'ThanhCong' AND `nguoi_thu_id` IS NOT NULL) OR (`phuong_thuc` <> 'TienMatTaiQuay' AND `nguoi_thu_id` IS NULL)",
)
export class GiaoDichThanhToan {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'giao_dich_thanh_toan_id' })
  giaoDichThanhToanId!: string;

  @Column({ name: 'vi_noi_bo_id', type: 'bigint', nullable: true })
  viNoiBoId!: string | null;

  @Column({ name: 'lich_hen_id', type: 'bigint', nullable: true })
  lichHenId!: string | null;

  @Column({ name: 'loai', type: 'enum', enum: LOAI_GIAO_DICH_THANH_TOAN })
  loai!: LoaiGiaoDichThanhToan;

  @Column({ name: 'phuong_thuc', type: 'enum', enum: PHUONG_THUC_THANH_TOAN })
  phuongThuc!: PhuongThucThanhToan;

  @Column({ name: 'so_tien', type: 'decimal', precision: 12, scale: 2 })
  soTien!: string;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_GIAO_DICH_THANH_TOAN,
    default: 'KhoiTao',
  })
  trangThai!: TrangThaiGiaoDichThanhToan;

  // NULL tới khi cổng trả mã; cùng UNIQUE với phuongThuc để IPN lặp không xử lý hai lần.
  @Column({
    name: 'ma_giao_dich_cong',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  maGiaoDichCong!: string | null;

  @Column({
    name: 'trang_thai_doi_soat',
    type: 'enum',
    enum: TRANG_THAI_DOI_SOAT,
    default: 'KhongCan',
  })
  trangThaiDoiSoat!: TrangThaiDoiSoat;

  // Lễ tân xác nhận đã nhận tiền mặt (lấy từ phiên đăng nhập, không nhận từ giao diện); trống với mọi phương thức khác.
  @Column({ name: 'nguoi_thu_id', type: 'bigint', nullable: true })
  nguoiThuId!: string | null;

  // Không có mặc định ở DB: service ghi giờ Việt Nam (nowVN), không dùng NOW().
  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}

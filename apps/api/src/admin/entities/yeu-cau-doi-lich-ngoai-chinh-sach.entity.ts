import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
  TRANG_THAI_YEU_CAU_DOI_LICH,
  type TrangThaiYeuCauDoiLich,
} from './enums.js';

// Yêu cầu đổi lịch ngoài chính sách (reschedule P1, UC 2.4.9 A2 và 2.4.31). Khớp từng cột với CREATE TABLE trong docs/database/clinix_mysql.sql; hai CHECK chép đúng biểu thức của DDL.
// Không khai quan hệ @ManyToOne (như thong-bao, lich-hen): khóa ngoại do migration tạo, mã nghiệp vụ dùng id.
@Entity({ name: 'yeu_cau_doi_lich_ngoai_chinh_sach' })
@Check(
  'chk_doi_lich_xu_ly',
  "`trang_thai` = 'ChoDuyet' OR `ghi_chu_xu_ly` IS NOT NULL",
)
@Check(
  'chk_doi_lich_nguoi_xu_ly',
  "(`trang_thai` = 'ChoDuyet' AND `nguoi_xu_ly_id` IS NULL AND `thoi_diem_xu_ly` IS NULL) OR (`trang_thai` IN ('DaDuyet','TuChoi') AND `nguoi_xu_ly_id` IS NOT NULL AND `thoi_diem_xu_ly` IS NOT NULL)",
)
@Index('yeu_cau_doi_lich_ngoai_chinh_sach_index_12', [
  'trangThai',
  'thoiDiemTao',
])
export class YeuCauDoiLichNgoaiChinhSach {
  @PrimaryGeneratedColumn({
    type: 'bigint',
    name: 'yeu_cau_doi_lich_ngoai_chinh_sach_id',
  })
  yeuCauDoiLichNgoaiChinhSachId!: string;

  @Column({ name: 'lich_hen_id', type: 'bigint' })
  lichHenId!: string;

  @Column({ name: 'khung_gio_mong_muon_id', type: 'bigint' })
  khungGioMongMuonId!: string;

  @Column({ name: 'ly_do_yeu_cau', type: 'text' })
  lyDoYeuCau!: string;

  @Column({
    name: 'trang_thai',
    type: 'enum',
    enum: TRANG_THAI_YEU_CAU_DOI_LICH,
    default: 'ChoDuyet',
  })
  trangThai!: TrangThaiYeuCauDoiLich;

  @Column({
    name: 'ghi_chu_xu_ly',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  ghiChuXuLy!: string | null;

  @Column({ name: 'nguoi_xu_ly_id', type: 'bigint', nullable: true })
  nguoiXuLyId!: string | null;

  @Column({ name: 'thoi_diem_xu_ly', type: 'datetime', nullable: true })
  thoiDiemXuLy!: Date | null;

  // DDL không có DEFAULT: mã nghiệp vụ (reschedule B5) tự đặt bằng đồng hồ ứng dụng.
  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}

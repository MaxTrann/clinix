import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { KET_QUA_HOAN_TIEN, LOAI_HOAN_TIEN } from './wallet-enums.js';
import type { KetQuaHoanTien, LoaiHoanTien } from './wallet-enums.js';

// Mỗi dòng = MỘT lần thử hoàn tiền về ví, kể cả lần thất bại. `loai` phân biệt hoàn cọc tự động khi huỷ (TuDong) với hoàn đặc biệt do Quản trị viên
// (DacBiet; cột thêm ở payment P1, Q23). UNIQUE (giao_dich_thanh_toan_id, so_lan_thu) chặn ghi trùng một lần thử. Các khóa ngoại là cột thuần.
@Entity({ name: 'lich_su_hoan_tien' })
@Index('lich_su_hoan_tien_index_20', ['giaoDichThanhToanId', 'soLanThu'], {
  unique: true,
})
export class LichSuHoanTien {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'lich_su_hoan_tien_id' })
  lichSuHoanTienId!: string;

  // Khoản được hoàn = giao dịch thanh toán của lịch gốc.
  @Column({ name: 'giao_dich_thanh_toan_id', type: 'bigint' })
  giaoDichThanhToanId!: string;

  @Column({ name: 'vi_noi_bo_id', type: 'bigint' })
  viNoiBoId!: string;

  @Column({
    name: 'loai',
    type: 'enum',
    enum: LOAI_HOAN_TIEN,
    default: 'TuDong',
  })
  loai!: LoaiHoanTien;

  @Column({ name: 'so_tien', type: 'decimal', precision: 12, scale: 2 })
  soTien!: string;

  @Column({ name: 'ly_do', type: 'varchar', length: 255, nullable: true })
  lyDo!: string | null;

  @Column({ name: 'trang_thai', type: 'enum', enum: KET_QUA_HOAN_TIEN })
  trangThai!: KetQuaHoanTien;

  @Column({ name: 'so_lan_thu', type: 'int', default: 1 })
  soLanThu!: number;

  @Column({ name: 'thoi_diem', type: 'datetime' })
  thoiDiem!: Date;
}

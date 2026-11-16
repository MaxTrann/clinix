import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { KET_QUA_DOI_SOAT } from './wallet-enums.js';
import type { KetQuaDoiSoat } from './wallet-enums.js';

// Lịch sử các lần đối soát nạp ví (bảng mới ở payment P1, Q9), chỉ thêm không sửa: mỗi dòng một lần thử cộng ví cho giao dịch nạp đã được cổng xác nhận
// nhưng chưa cộng được. `soLanThu`: 0 = lần cộng đầu bị lỗi lúc xác minh, 1 đến 3 = job tự động, từ 4 = Quản trị viên. `nguoiXuLyId` trống khi là job.
// `lyDo` chỉ chứa mã lỗi dạng mã hoặc lý do của Quản trị viên, KHÔNG ghi văn bản lỗi gốc của cổng. Các khóa ngoại là cột thuần.
@Entity({ name: 'lan_doi_soat_nap_vi' })
@Index(
  'lan_doi_soat_nap_vi_index_lan_thu',
  ['giaoDichThanhToanId', 'soLanThu'],
  { unique: true },
)
export class LanDoiSoatNapVi {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'lan_doi_soat_nap_vi_id' })
  lanDoiSoatNapViId!: string;

  @Column({ name: 'giao_dich_thanh_toan_id', type: 'bigint' })
  giaoDichThanhToanId!: string;

  @Column({ name: 'so_lan_thu', type: 'int' })
  soLanThu!: number;

  @Column({ name: 'ket_qua', type: 'enum', enum: KET_QUA_DOI_SOAT })
  ketQua!: KetQuaDoiSoat;

  @Column({ name: 'nguoi_xu_ly_id', type: 'bigint', nullable: true })
  nguoiXuLyId!: string | null;

  @Column({ name: 'ly_do', type: 'varchar', length: 255, nullable: true })
  lyDo!: string | null;

  @Column({ name: 'thoi_diem', type: 'datetime' })
  thoiDiem!: Date;
}

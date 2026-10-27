import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'thong_bao' })
@Index('thong_bao_index_25', ['taiKhoanId', 'trangThaiDoc', 'thoiDiemTao'])
@Index(
  'thong_bao_index_yeu_cau_chi_nhanh',
  ['yeuCauThayDoiChiNhanhId', 'taiKhoanId', 'loaiSuKien'],
  { unique: true },
)
export class ThongBao {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'thong_bao_id' })
  thongBaoId!: string;

  @Column({ name: 'tai_khoan_id', type: 'bigint' })
  taiKhoanId!: string;

  @Column({ name: 'noi_dung', type: 'varchar', length: 500 })
  noiDung!: string;

  @Column({ name: 'loai_su_kien', type: 'varchar', length: 100 })
  loaiSuKien!: string;

  @Column({ name: 'trang_thai_doc', type: 'boolean', default: false })
  trangThaiDoc!: boolean;

  @Column({
    name: 'yeu_cau_thay_doi_chi_nhanh_id',
    type: 'bigint',
    nullable: true,
  })
  yeuCauThayDoiChiNhanhId!: string | null;

  @Column({ name: 'thoi_diem_tao', type: 'datetime' })
  thoiDiemTao!: Date;
}

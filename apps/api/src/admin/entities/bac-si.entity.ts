import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import {
  CHUC_DANH_BAC_SI,
  HOC_VI_BAC_SI,
  type ChucDanhBacSi,
  type HocViBacSi,
} from './enums.js';

// Bảng hồ sơ bác sĩ; hai CHECK giữ kinh nghiệm và cặp chức danh/học vị hợp lệ.
@Entity({ name: 'bac_si' })
@Check('chk_bac_si_kinh_nghiem', '`so_nam_kinh_nghiem` >= 0')
@Check(
  'chk_bac_si_chuc_danh_hoc_vi',
  "(`chuc_danh` IN ('BS', 'BS_CKI', 'BS_CKII') AND `hoc_vi` = 'BS') OR (`chuc_danh` = 'ThS_BS' AND `hoc_vi` = 'ThS') OR (`chuc_danh` = 'TS_BS' AND `hoc_vi` = 'TS') OR (`chuc_danh` = 'PGS_TS_BS' AND `hoc_vi` = 'PGS') OR (`chuc_danh` = 'GS_TS_BS' AND `hoc_vi` = 'GS')",
)
export class BacSi {
  @PrimaryColumn({ type: 'bigint', name: 'tai_khoan_id' })
  taiKhoanId!: string;

  @Column({ name: 'mo_ta_chuyen_mon', type: 'text', nullable: true })
  moTaChuyenMon!: string | null;

  @Column({ name: 'so_nam_kinh_nghiem', type: 'int', default: 0 })
  soNamKinhNghiem!: number;

  @Column({ name: 'hoc_vi', type: 'enum', enum: HOC_VI_BAC_SI })
  hocVi!: HocViBacSi;

  @Column({ name: 'chuc_danh', type: 'enum', enum: CHUC_DANH_BAC_SI })
  chucDanh!: ChucDanhBacSi;

  @Column({ name: 'chuyen_khoa_id', type: 'bigint' })
  chuyenKhoaId!: string;

  @Column({ name: 'chi_nhanh_id', type: 'bigint' })
  chiNhanhId!: string;

  @Column({ name: 'dich_vu_kham_id', type: 'bigint' })
  dichVuKhamId!: string;
}

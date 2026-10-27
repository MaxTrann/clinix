import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { LY_DO_ANH_HUONG_LICH_HEN, type LyDoAnhHuongLichHen } from './enums.js';

@Entity({ name: 'yeu_cau_thay_doi_chi_nhanh_lich_hen' })
@Index('yeu_cau_thay_doi_chi_nhanh_lich_hen_index_lich_hen', ['lichHenId'])
export class YeuCauThayDoiChiNhanhLichHen {
  @PrimaryColumn({ type: 'bigint', name: 'yeu_cau_thay_doi_chi_nhanh_id' })
  yeuCauThayDoiChiNhanhId!: string;

  @PrimaryColumn({ type: 'bigint', name: 'lich_hen_id' })
  lichHenId!: string;

  @Column({
    name: 'ly_do_anh_huong',
    type: 'enum',
    enum: LY_DO_ANH_HUONG_LICH_HEN,
  })
  lyDoAnhHuong!: LyDoAnhHuongLichHen;
}

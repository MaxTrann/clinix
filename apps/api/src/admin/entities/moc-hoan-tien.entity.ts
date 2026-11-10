import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Mốc hoàn tiền của một dịch vụ khám (Q15): hủy trước giờ hẹn ít nhất `soGioTruocToiThieu` giờ thì hoàn `tyLeHoan` phần trăm.
// Khóa ngoại `dichVuKhamId` là cột thuần (khóa ngoại thật nằm ở DB, do migration tạo; synchronize: false).
// Booking đọc các mốc của một dịch vụ để chụp chính sách vào lich_hen.chinh_sach_hoan_snapshot khi đặt lịch cọc > 0.
@Entity({ name: 'moc_hoan_tien' })
@Index('moc_hoan_tien_index_1', ['dichVuKhamId', 'soGioTruocToiThieu'], {
  unique: true,
})
@Check('chk_moc_hoan_ty_le', '`ty_le_hoan` BETWEEN 0 AND 100')
export class MocHoanTien {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'moc_hoan_tien_id' })
  mocHoanTienId!: string;

  @Column({ name: 'dich_vu_kham_id', type: 'bigint' })
  dichVuKhamId!: string;

  @Column({ name: 'so_gio_truoc_toi_thieu', type: 'int' })
  soGioTruocToiThieu!: number;

  @Column({ name: 'ty_le_hoan', type: 'tinyint' })
  tyLeHoan!: number;
}

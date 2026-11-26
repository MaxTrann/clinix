import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Một tin nhắn (chat P1; PLAN chat 5.2, Q7, Q10, Q21). Chỉ INSERT (không sửa, không xoá tin). `ma_gui` chống gửi trùng theo người gửi; bốn cột tệp mô tả tệp đính kèm trên volume riêng.
// Hai CHECK khai ở đây để đọc mã thấy luật; CHECK thật do migration tạo (synchronize: false).
@Entity({ name: 'tin_nhan' })
@Check(
  'chk_tin_nhan_tep',
  '(`tep_dinh_kem` IS NULL AND `tep_ten_goc` IS NULL AND `tep_loai` IS NULL AND `tep_dung_luong` IS NULL) OR (`tep_dinh_kem` IS NOT NULL AND `tep_ten_goc` IS NOT NULL AND `tep_loai` IS NOT NULL AND `tep_dung_luong` IS NOT NULL AND `tep_dung_luong` BETWEEN 1 AND 10485760)',
)
@Check(
  'chk_tin_nhan_noi_dung',
  "`noi_dung` <> '' OR `tep_dinh_kem` IS NOT NULL",
)
@Index('tin_nhan_index_28', ['hoiThoaiId', 'tinNhanId'])
@Index('tin_nhan_index_nguoi_gui_ma_gui', ['nguoiGuiId', 'maGui'], {
  unique: true,
})
// chat P2 (b): câu đếm giới hạn tốc độ 20 tin/phút theo người gửi (PLAN chat 5.5; số đo X1 M4)
@Index('tin_nhan_index_nguoi_gui_thoi_diem', ['nguoiGuiId', 'thoiDiemGui'])
export class TinNhan {
  @PrimaryGeneratedColumn({ name: 'tin_nhan_id', type: 'bigint' })
  tinNhanId!: string;

  @Column({ name: 'hoi_thoai_id', type: 'bigint' })
  hoiThoaiId!: string;

  @Column({ name: 'nguoi_gui_id', type: 'bigint' })
  nguoiGuiId!: string;

  /** Mã ý định gửi do client sinh (UUID); `null` cho tin nạp sẵn. Duy nhất theo người gửi. */
  @Column({ name: 'ma_gui', type: 'char', length: 36, nullable: true })
  maGui!: string | null;

  /** Văn bản thuần; rỗng chỉ khi có tệp đính kèm. */
  @Column({ name: 'noi_dung', type: 'text' })
  noiDung!: string;

  /** Khoá lưu trữ của tệp trên volume riêng; `null` nếu không có tệp. */
  @Column({
    name: 'tep_dinh_kem',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  tepDinhKem!: string | null;

  @Column({ name: 'tep_ten_goc', type: 'varchar', length: 255, nullable: true })
  tepTenGoc!: string | null;

  /** Kiểu MIME do máy chủ xác định từ nội dung tệp. */
  @Column({ name: 'tep_loai', type: 'varchar', length: 100, nullable: true })
  tepLoai!: string | null;

  /** Số byte đã lưu (1 đến 10 MB). */
  @Column({ name: 'tep_dung_luong', type: 'int', nullable: true })
  tepDungLuong!: number | null;

  @Column({ name: 'thoi_diem_gui', type: 'datetime' })
  thoiDiemGui!: Date;
}

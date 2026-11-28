import { getMetadataArgsStorage } from 'typeorm';
import { ENTITIES } from '../../database/entities.js';
import { BaiViet } from './bai-viet.entity.js';
import { BaiVietHashtag } from './bai-viet-hashtag.entity.js';
import { BenhNhanDanhGiaBaiViet } from './benh-nhan-danh-gia-bai-viet.entity.js';
import { Hashtag } from './hashtag.entity.js';

// article B1 — ABD-07 phần entity: bốn entity có trong sổ ENTITIES, đúng tên bảng, đúng cột, khóa chính, chỉ mục khớp DDL. Thứ tự mốc migration ở database/migration-source.spec.ts.
// Metadata đọc từ decorator (không cần DB). TypeORM không tự đồng bộ (synchronize: false) nên chính test này giữ entity khỏi lệch DDL.
const storage = getMetadataArgsStorage();

const tableOf = (target: Function): string | undefined =>
  storage.tables.find((table) => table.target === target)?.name;

/** Ánh xạ thuộc tính → tên cột của một entity. */
function columnsOf(target: Function): Record<string, string> {
  return Object.fromEntries(
    storage.columns
      .filter((column) => column.target === target)
      .map((column) => [
        column.propertyName,
        column.options.name ?? column.propertyName,
      ]),
  );
}

function primaryOf(target: Function): string[] {
  return storage.columns
    .filter(
      (column) => column.target === target && column.options.primary === true,
    )
    .map((column) => column.options.name ?? column.propertyName);
}

function indicesOf(target: Function) {
  return storage.indices.filter((index) => index.target === target);
}

describe('article — bốn entity khớp DDL (ABD-07)', () => {
  it('ABD-07: bốn entity có trong ENTITIES, mỗi entity đúng một lần', () => {
    for (const entity of [
      BaiViet,
      Hashtag,
      BaiVietHashtag,
      BenhNhanDanhGiaBaiViet,
    ])
      expect(ENTITIES.filter((item) => item === entity)).toHaveLength(1);
  });

  it('ABD-07: tên bảng đúng (snake_case tiếng Việt không dấu của schema)', () => {
    expect(tableOf(BaiViet)).toBe('bai_viet');
    expect(tableOf(Hashtag)).toBe('hashtag');
    expect(tableOf(BaiVietHashtag)).toBe('bai_viet_hashtag');
    expect(tableOf(BenhNhanDanhGiaBaiViet)).toBe('benh_nhan_danh_gia_bai_viet');
  });

  it('ABD-07: BaiViet có đủ 10 cột, thuộc tính camelCase của cột, khóa riêng (baiVietId, không `id` chung)', () => {
    expect(columnsOf(BaiViet)).toEqual({
      baiVietId: 'bai_viet_id',
      tacGiaId: 'tac_gia_id',
      tieuDe: 'tieu_de',
      moTaNgan: 'mo_ta_ngan',
      noiDung: 'noi_dung',
      anhDaiDien: 'anh_dai_dien',
      trangThai: 'trang_thai',
      thoiDiemXuatBan: 'thoi_diem_xuat_ban',
      thoiDiemTao: 'thoi_diem_tao',
      capNhatLanCuoi: 'cap_nhat_lan_cuoi',
    });
    expect(primaryOf(BaiViet)).toEqual(['bai_viet_id']);
    expect(indicesOf(BaiViet)).toEqual([]);
  });

  it('ABD-07: BaiViet.trangThai là ENUM ba giá trị, mặc định BanNhap; cap_nhat_lan_cuoi có ON UPDATE', () => {
    const column = (name: string) =>
      storage.columns.find(
        (item) => item.target === BaiViet && item.propertyName === name,
      );
    expect(column('trangThai')?.options.enum).toEqual([
      'BanNhap',
      'DaXuatBan',
      'LuuTruAn',
    ]);
    expect(column('trangThai')?.options.default).toBe('BanNhap');
    expect(column('capNhatLanCuoi')?.options.onUpdate).toBe(
      'CURRENT_TIMESTAMP',
    );
    expect(column('moTaNgan')?.options.nullable).toBe(true);
    expect(column('thoiDiemXuatBan')?.options.nullable).toBe(true);
  });

  it('ABD-07: Hashtag: ba cột, UNIQUE `ten` (tên chỉ mục thật của MySQL là `ten`)', () => {
    expect(columnsOf(Hashtag)).toEqual({
      hashtagId: 'hashtag_id',
      ten: 'ten',
      trangThaiHoatDong: 'trang_thai_hoat_dong',
    });
    expect(primaryOf(Hashtag)).toEqual(['hashtag_id']);
    const [index, ...rest] = indicesOf(Hashtag);
    expect(rest).toEqual([]);
    expect(index?.name).toBe('ten');
    expect(index?.unique).toBe(true);
    expect(index?.columns).toEqual(['ten']);
  });

  it('ABD-07: BaiVietHashtag: khóa chính kép (bài, thẻ) và chỉ mục (hashtag_id, bai_viet_id) đúng thứ tự cột', () => {
    expect(columnsOf(BaiVietHashtag)).toEqual({
      baiVietId: 'bai_viet_id',
      hashtagId: 'hashtag_id',
    });
    expect(primaryOf(BaiVietHashtag)).toEqual(['bai_viet_id', 'hashtag_id']);
    const [index, ...rest] = indicesOf(BaiVietHashtag);
    expect(rest).toEqual([]);
    expect(index?.name).toBe('bai_viet_hashtag_index_23');
    expect(index?.columns).toEqual(['hashtagId', 'baiVietId']);
    expect(index?.unique).toBeFalsy();
  });

  it('ABD-07: BenhNhanDanhGiaBaiViet: khóa chính kép (bệnh nhân, bài), ENUM Thich/KhongThich, chỉ mục (bai_viet_id, loai)', () => {
    expect(columnsOf(BenhNhanDanhGiaBaiViet)).toEqual({
      benhNhanId: 'benh_nhan_id',
      baiVietId: 'bai_viet_id',
      loai: 'loai',
    });
    expect(primaryOf(BenhNhanDanhGiaBaiViet)).toEqual([
      'benh_nhan_id',
      'bai_viet_id',
    ]);
    const loai = storage.columns.find(
      (item) =>
        item.target === BenhNhanDanhGiaBaiViet && item.propertyName === 'loai',
    );
    expect(loai?.options.enum).toEqual(['Thich', 'KhongThich']);
    const [index, ...rest] = indicesOf(BenhNhanDanhGiaBaiViet);
    expect(rest).toEqual([]);
    expect(index?.name).toBe('benh_nhan_danh_gia_bai_viet_index_24');
    expect(index?.columns).toEqual(['baiVietId', 'loai']);
  });
});

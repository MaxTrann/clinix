import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { BaiViet } from '../article/entities/bai-viet.entity.js';
import { BaiVietHashtag } from '../article/entities/bai-viet-hashtag.entity.js';
import { BenhNhanDanhGiaBaiViet } from '../article/entities/benh-nhan-danh-gia-bai-viet.entity.js';
import { Hashtag } from '../article/entities/hashtag.entity.js';
import {
  ArticleFixtures,
  mysqlErrno,
} from '../article/testing/article-fixtures.js';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';

// article B1 (#795) — bốn bảng bài viết trên MySQL 8.4 THẬT: ABD-04 (collation của `hashtag.ten`: GHI HÀNH VI THẬT), ABD-05 (mặc định, ON UPDATE, khóa kép, khóa ngoại, ENUM, ghi và đọc qua entity),
// ABD-06 (cột `text` chặn 65.535 byte, chứng minh luật 60.000 byte ở service là cần). ABD-01 ở schema-parity.int-spec.ts, ABD-02 và ABD-07 ở migration-source.spec.ts, ABD-03 ở migrations.int-spec.ts.
let db: DataSource;
let fx: AdminFixtures;
let af: ArticleFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
  af = new ArticleFixtures(d);
});

const DUPLICATE = 1062;
const NO_PARENT = 1452;
const HAS_CHILD = 1451;
const TOO_LONG = 1406;
const TRUNCATED = 1265;

/** Kết quả đo thật của một cặp thẻ: chèn `first` rồi thử chèn `second`. */
async function probePair(
  first: string,
  second: string,
): Promise<{ uniqueBlocks: boolean; equalsInSelect: boolean }> {
  await db.query('DELETE FROM hashtag');
  await db.query('INSERT INTO hashtag (ten) VALUES (?)', [first]);
  const equal: { n: string | number }[] = await db.query(
    'SELECT COUNT(*) AS n FROM hashtag WHERE ten = ?',
    [second],
  );
  let uniqueBlocks = false;
  try {
    await db.query('INSERT INTO hashtag (ten) VALUES (?)', [second]);
  } catch (error) {
    uniqueBlocks =
      (error as { driverError?: { errno?: number } }).driverError?.errno ===
      DUPLICATE;
    if (!uniqueBlocks) throw error;
  }
  return { uniqueBlocks, equalsInSelect: Number(equal[0]?.n) === 1 };
}

describe('hashtag.ten theo utf8mb4_unicode_ci (ABD-04)', () => {
  it('ABD-04: cột `ten` dùng collation utf8mb4_unicode_ci', async () => {
    const rows: { collation: string }[] = await db.query(
      "SELECT COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'hashtag' AND COLUMN_NAME = 'ten'",
    );
    expect(rows[0]?.collation).toBe('utf8mb4_unicode_ci');
  });

  // GHI HÀNH VI THẬT của MySQL 8.4 cho từng cặp (kết quả này quyết định nhánh T6: nếu UNIQUE KHÔNG chặn các cặp khác dấu thì nhánh 409 `THE_TRUNG_KHONG_DAU` là thừa).
  // `uniqueBlocks`: lần chèn thứ hai bị UNIQUE chặn (1062). `equalsInSelect`: `WHERE ten = <tên thứ hai>` tìm thấy dòng đầu (hai cách phải nhất quán).
  // KẾT QUẢ ĐO ngày 28/11/2026, MySQL 8.4 (lần chạy đầu giả định đau/dau cũng bị chặn: ĐỎ ở đúng cặp này): UNIQUE chặn mắt/mặt, mắt/mat, mắt/MẮT, mắt/"mắt " (PAD SPACE) và trùng nguyên văn,
  // KHÔNG chặn đau/dau: `đ` và `d` là HAI chữ khác nhau ở utf8mb4_unicode_ci. Nhánh 409 `THE_TRUNG_KHONG_DAU` của T6 vì thế CÓ cần (mắt và mặt là cùng một khoá), nhưng chỉ cho dấu thanh và dấu mũ,
  // không cho `đ`. Khoá sắp xếp thẻ (hashtag-name.ts) gập cả `đ` thành `d` nên THÔ HƠN lớp tương đương của collation ở cặp này: vẫn an toàn (tên cùng lớp collation luôn cùng khoá).
  it('ABD-04: hành vi thật của từng cặp tên (không phân biệt hoa thường và dấu thanh; khoảng trắng cuối bị bỏ qua vì PAD SPACE; đ khác d)', async () => {
    const observed = {
      'mắt/mặt': await probePair('mắt', 'mặt'),
      'mắt/mat': await probePair('mắt', 'mat'),
      'mắt/MẮT': await probePair('mắt', 'MẮT'),
      'mắt/mắt+khoảng trắng cuối': await probePair('mắt', 'mắt '),
      'đau/dau': await probePair('đau', 'dau'),
      // Cả bộ dấu tiếng Việt: dấu mũ và móc (chữ gốc cùng) và hai dấu chồng; chỉ `đ` là chữ riêng
      'ă/a': await probePair('ăn', 'an'),
      'â/a': await probePair('âm', 'am'),
      'ê/e': await probePair('êm', 'em'),
      'ô/o': await probePair('ôn', 'on'),
      'ơ/o': await probePair('ơn', 'on'),
      'ư/u': await probePair('ưu', 'uu'),
      'ợ/o (hai dấu chồng: móc và nặng)': await probePair('ợ', 'o'),
      'ế/e (hai dấu chồng: mũ và sắc)': await probePair('ế', 'e'),
      'mắt/mắt (nguyên văn)': await probePair('mắt', 'mắt'),
      'mắt/mắu (đối chứng khác chữ)': await probePair('mắt', 'mắu'),
    };
    const blocked = { uniqueBlocks: true, equalsInSelect: true };
    const free = { uniqueBlocks: false, equalsInSelect: false };
    expect(observed).toEqual({
      'mắt/mặt': blocked,
      'mắt/mat': blocked,
      'mắt/MẮT': blocked,
      'mắt/mắt+khoảng trắng cuối': blocked,
      'đau/dau': free,
      'ă/a': blocked,
      'â/a': blocked,
      'ê/e': blocked,
      'ô/o': blocked,
      'ơ/o': blocked,
      'ư/u': blocked,
      'ợ/o (hai dấu chồng: móc và nặng)': blocked,
      'ế/e (hai dấu chồng: mũ và sắc)': blocked,
      'mắt/mắt (nguyên văn)': blocked,
      'mắt/mắu (đối chứng khác chữ)': free,
    });
  });
});

describe('bốn bảng bài viết trên MySQL thật (ABD-05)', () => {
  it('ABD-05: bai_viet: trang_thai mặc định BanNhap, thoi_diem_xuat_ban NULL, hai thời điểm tự đặt', async () => {
    const admin = await fx.admin();
    await db.query(
      "INSERT INTO bai_viet (tac_gia_id, tieu_de, noi_dung) VALUES (?, 'Mặc định', '')",
      [admin.account.taiKhoanId],
    );
    const [row] = (await db.query(
      `SELECT trang_thai AS trangThai, thoi_diem_xuat_ban AS xuatBan, thoi_diem_tao AS tao, cap_nhat_lan_cuoi AS capNhat, mo_ta_ngan AS moTa, anh_dai_dien AS anh
         FROM bai_viet WHERE tieu_de = 'Mặc định'`,
    )) as {
      trangThai: string;
      xuatBan: Date | null;
      tao: Date;
      capNhat: Date;
      moTa: string | null;
      anh: string | null;
    }[];
    expect(row?.trangThai).toBe('BanNhap');
    expect(row?.xuatBan).toBeNull();
    expect(row?.moTa).toBeNull();
    expect(row?.anh).toBeNull();
    expect(row?.tao).toBeInstanceOf(Date);
    expect(row?.capNhat).toBeInstanceOf(Date);
  });

  it('ABD-05: cap_nhat_lan_cuoi tự đổi khi dòng thật sự thay đổi, giữ nguyên khi UPDATE không đổi giá trị nào', async () => {
    const admin = await fx.admin();
    const id = await af.article({
      tacGiaId: admin.account.taiKhoanId,
      capNhatLanCuoi: new Date('2026-01-01T01:00:00.000Z'),
    });
    const before = (await af.articleRow(id))?.capNhatLanCuoi;
    expect(before).toBe('2026-01-01 08:00:00');

    await db.query(
      'UPDATE bai_viet SET tieu_de = tieu_de WHERE bai_viet_id = ?',
      [id],
    );
    expect((await af.articleRow(id))?.capNhatLanCuoi).toBe(before);

    await db.query(
      "UPDATE bai_viet SET tieu_de = 'Đã đổi' WHERE bai_viet_id = ?",
      [id],
    );
    const after = (await af.articleRow(id))?.capNhatLanCuoi;
    expect(after).not.toBe(before);
    expect(String(after) > String(before)).toBe(true);
  });

  it('ABD-05: khóa chính kép của bai_viet_hashtag và của phiếu đánh giá: chèn trùng bị từ chối (1062)', async () => {
    const admin = await fx.admin();
    const patient = await fx.patient();
    const bai = await af.article({ tacGiaId: admin.account.taiKhoanId });
    const the = await af.hashtag('ho');
    await af.attach(bai, the);
    expect(await mysqlErrno(af.attach(bai, the))).toBe(DUPLICATE);
    await af.rating(patient.account.taiKhoanId, bai, 'Thich');
    expect(
      await mysqlErrno(
        af.rating(patient.account.taiKhoanId, bai, 'KhongThich'),
      ),
    ).toBe(DUPLICATE);
  });

  it('ABD-05: khóa ngoại: tac_gia_id phải là Quản trị viên (Bệnh nhân hay mã không có bị 1452); dòng nối và phiếu cần bài, thẻ, bệnh nhân có thật (1452)', async () => {
    const admin = await fx.admin();
    const patient = await fx.patient();
    for (const tacGiaId of [patient.account.taiKhoanId, '999999'])
      expect(await mysqlErrno(af.article({ tacGiaId }))).toBe(NO_PARENT);
    const bai = await af.article({ tacGiaId: admin.account.taiKhoanId });
    const the = await af.hashtag('ho');
    expect(await mysqlErrno(af.attach('999999', the))).toBe(NO_PARENT);
    expect(await mysqlErrno(af.attach(bai, '999999'))).toBe(NO_PARENT);
    expect(
      await mysqlErrno(af.rating(admin.account.taiKhoanId, bai, 'Thich')),
    ).toBe(NO_PARENT);
    expect(
      await mysqlErrno(
        af.rating(patient.account.taiKhoanId, '999999', 'Thich'),
      ),
    ).toBe(NO_PARENT);
  });

  it('ABD-05: khóa ngoại không có ON DELETE CASCADE: xóa bài còn dòng nối hay phiếu bị chặn (1451); xóa tác giả còn bài cũng bị chặn', async () => {
    const admin = await fx.admin();
    const patient = await fx.patient();
    const bai = await af.article({ tacGiaId: admin.account.taiKhoanId });
    const the = await af.hashtag('ho');
    await af.attach(bai, the);
    expect(
      await mysqlErrno(
        db.query('DELETE FROM bai_viet WHERE bai_viet_id = ?', [bai]),
      ),
    ).toBe(HAS_CHILD);
    expect(
      await mysqlErrno(
        db.query('DELETE FROM hashtag WHERE hashtag_id = ?', [the]),
      ),
    ).toBe(HAS_CHILD);
    await db.query('DELETE FROM bai_viet_hashtag WHERE bai_viet_id = ?', [bai]);
    await af.rating(patient.account.taiKhoanId, bai, 'Thich');
    expect(
      await mysqlErrno(
        db.query('DELETE FROM bai_viet WHERE bai_viet_id = ?', [bai]),
      ),
    ).toBe(HAS_CHILD);
    expect(
      await mysqlErrno(
        db.query('DELETE FROM quan_tri_vien WHERE tai_khoan_id = ?', [
          admin.account.taiKhoanId,
        ]),
      ),
    ).toBe(HAS_CHILD);
  });

  it('ABD-05: ENUM trạng thái bài và loại phiếu bị từ chối khi giá trị lạ; tên thẻ 50 ký tự nhận, 51 bị từ chối', async () => {
    const admin = await fx.admin();
    const patient = await fx.patient();
    expect(
      await mysqlErrno(
        db.query(
          "INSERT INTO bai_viet (tac_gia_id, tieu_de, noi_dung, trang_thai) VALUES (?, 'x', '', 'Foo')",
          [admin.account.taiKhoanId],
        ),
      ),
    ).toBe(TRUNCATED);
    const bai = await af.article({ tacGiaId: admin.account.taiKhoanId });
    expect(
      await mysqlErrno(
        db.query(
          "INSERT INTO benh_nhan_danh_gia_bai_viet (benh_nhan_id, bai_viet_id, loai) VALUES (?, ?, 'Meh')",
          [patient.account.taiKhoanId, bai],
        ),
      ),
    ).toBe(TRUNCATED);
    await af.hashtag('a'.repeat(50));
    expect(await mysqlErrno(af.hashtag('b'.repeat(51)))).toBe(TOO_LONG);
  });

  it('ABD-05: ghi và đọc lại qua bốn entity (tên thuộc tính camelCase khớp cột)', async () => {
    const admin = await fx.admin();
    const patient = await fx.patient();
    const baiRepo = db.getRepository(BaiViet);
    const bai = await baiRepo.save(
      baiRepo.create({
        tacGiaId: admin.account.taiKhoanId,
        tieuDe: 'Qua entity',
        moTaNgan: 'Mô tả',
        noiDung: 'Nội dung',
        trangThai: 'DaXuatBan',
        thoiDiemXuatBan: new Date('2026-11-02T01:00:00.000Z'),
      }),
    );
    const theRepo = db.getRepository(Hashtag);
    const the = await theRepo.save(theRepo.create({ ten: 'qua-entity' }));
    await db
      .getRepository(BaiVietHashtag)
      .save({ baiVietId: bai.baiVietId, hashtagId: the.hashtagId });
    await db.getRepository(BenhNhanDanhGiaBaiViet).save({
      benhNhanId: patient.account.taiKhoanId,
      baiVietId: bai.baiVietId,
      loai: 'KhongThich',
    });

    const back = await baiRepo.findOneByOrFail({ baiVietId: bai.baiVietId });
    expect(back).toMatchObject({
      tacGiaId: admin.account.taiKhoanId,
      tieuDe: 'Qua entity',
      moTaNgan: 'Mô tả',
      noiDung: 'Nội dung',
      trangThai: 'DaXuatBan',
      anhDaiDien: null,
    });
    expect(back.thoiDiemXuatBan?.toISOString()).toBe(
      '2026-11-02T01:00:00.000Z',
    );
    expect(back.thoiDiemTao).toBeInstanceOf(Date);
    expect(back.capNhatLanCuoi).toBeInstanceOf(Date);
    const theBack = await theRepo.findOneByOrFail({ hashtagId: the.hashtagId });
    expect(theBack).toMatchObject({
      ten: 'qua-entity',
      trangThaiHoatDong: true,
    });
    expect(
      await db.getRepository(BenhNhanDanhGiaBaiViet).findOneByOrFail({
        benhNhanId: patient.account.taiKhoanId,
        baiVietId: bai.baiVietId,
      }),
    ).toMatchObject({ loai: 'KhongThich' });
    expect(await af.tagNamesOf(bai.baiVietId)).toEqual(['qua-entity']);
  });
});

describe('cột nội dung của bài (ABD-06)', () => {
  it('ABD-06: noi_dung 65.535 byte nhận, 65.536 byte bị MySQL từ chối (1406); 60.001 byte DB vẫn nhận nên luật 60.000 byte là của service', async () => {
    const admin = await fx.admin();
    const insert = (noiDung: string): Promise<unknown> =>
      db.query(
        "INSERT INTO bai_viet (tac_gia_id, tieu_de, noi_dung) VALUES (?, 'Dài', ?)",
        [admin.account.taiKhoanId, noiDung],
      );
    await insert('a'.repeat(60_001));
    await insert('a'.repeat(65_535));
    expect(await mysqlErrno(insert('a'.repeat(65_536)))).toBe(TOO_LONG);
    const rows: { n: string | number }[] = await db.query(
      'SELECT COUNT(*) AS n FROM bai_viet',
    );
    expect(Number(rows[0]?.n)).toBe(2);
  });
});

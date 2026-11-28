import type { DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { UpdateArticleDto } from '../admin/article-admin.dto.js';
import { ArticleAdminRepository } from '../admin/article-admin.repository.js';
import { ArticleAdminService } from '../admin/article-admin.service.js';
import { HashtagRepository } from '../admin/hashtag.repository.js';
import type { TrangThaiBaiViet } from '../entities/enums.js';
import { PublicArticleListQueryDto } from '../public/public-article.dto.js';
import { PublicArticleRepository } from '../public/public-article.repository.js';
import { PublicArticleService } from '../public/public-article.service.js';
import {
  ArticleFixtures,
  captureSql,
  createGate,
  holdAfter,
  rejection,
  waitForBlockedStatement,
  waitUntilReached,
} from '../testing/article-fixtures.js';
import { PatientRatingRepository } from './patient-rating.repository.js';
import { PatientRatingService } from './patient-rating.service.js';

// article B3 — tích hợp trên MySQL 8.4 THẬT cho API đánh giá bài viết ở mức service (PLAN article 7.9): ABR-02 đến ABR-05 (đặt, đổi, thu hồi), ABR-06 (404 và không ghi),
// ABR-07 (ca cổng: Bệnh nhân đánh giá lúc Quản trị viên ẩn bài, hai chiều), ABR-08 (đua: hai tab cùng người, nhiều người), ABR-09 (số đếm ở chi tiết công khai, ẩn rồi xuất bản lại), ABR-10 (phiếu của chính mình).
// Chạy ở CẢ TZ=UTC và TZ=Asia/Ho_Chi_Minh. Quyền theo vai, header và thân HTTP nằm ở `test/article-rating.e2e-spec.ts`.
// Ca cổng: giữ MỘT giao dịch giữa hai bước (`holdAfter`) rồi chứng minh giao dịch kia thật sự BỊ CHẶN bằng `PROCESSLIST` (`waitForBlockedStatement`; `innodb_trx` không liệt kê giao dịch đang chờ khoá).
let db: DataSource;
let fx: AdminFixtures;
let af: ArticleFixtures;
let ratings: PatientRatingService;
let articles: ArticleAdminService;
let publicArticles: PublicArticleService;
let adminId: string;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
  af = new ArticleFixtures(d);
  ratings = new PatientRatingService(new PatientRatingRepository(d));
  articles = new ArticleAdminService(
    new ArticleAdminRepository(d),
    new HashtagRepository(d),
    new BranchAccessPolicy(),
  );
  publicArticles = new PublicArticleService(new PublicArticleRepository(d));
});
beforeEach(async () => {
  adminId = (await fx.admin()).account.taiKhoanId;
});

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
/** Số vòng của ca đua không cổng (ABR-08 iii); phiên kiểm yêu cầu ít nhất 20 vòng. */
const RACE_ROUNDS = 20;
const RACE_SIZE = 8;

const newPatient = async (): Promise<string> =>
  (await fx.patient()).account.taiKhoanId;
/** Bài đã xuất bản của Quản trị viên mặc định. */
const newArticle = (tieuDe = 'Sốt xuất huyết'): Promise<string> =>
  af.published({ tacGiaId: adminId, tieuDe });
const setStatus = (id: string, trangThai: TrangThaiBaiViet) =>
  articles.update(
    SYSTEM,
    id,
    Object.assign(new UpdateArticleDto(), { trangThai }),
  );
const NOT_FOUND = 'KHONG_TIM_THAY';

describe('đặt, đổi, thu hồi phiếu (ABR-02 đến ABR-05)', () => {
  it('ABR-02: PUT Thích khi chưa có phiếu ⇒ loai Thich, luotThich 1, luotKhongThich 0, đúng MỘT dòng DB', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    expect(await ratings.put(patient, id, 'Thich')).toEqual({
      loai: 'Thich',
      luotThich: 1,
      luotKhongThich: 0,
    });
    expect(await af.ratingRows(id)).toEqual([
      { benhNhanId: patient, loai: 'Thich' },
    ]);
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 1,
      luotKhongThich: 0,
    });
  });

  it('ABR-02 (T11, một giao dịch): đếm lỗi giữa chừng ⇒ phiếu vừa ghi bị HOÀN TÁC (không phiếu dở)', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    vi.spyOn(PatientRatingRepository.prototype, 'counts').mockRejectedValueOnce(
      new Error('ép lỗi giữa chừng'),
    );
    await expect(ratings.put(patient, id, 'Thich')).rejects.toThrow(
      'ép lỗi giữa chừng',
    );
    expect(await af.ratingOf(patient, id)).toBeNull();
    expect((await af.rowCounts()).benh_nhan_danh_gia_bai_viet).toBe(0);
  });

  it('ABR-03: PUT Không thích sau Thích ⇒ Thích −1, Không thích +1, VẪN một dòng; phiếu của người khác không đổi', async () => {
    const [mine, other] = [await newPatient(), await newPatient()];
    const id = await newArticle();
    await ratings.put(other, id, 'Thich');
    await ratings.put(mine, id, 'Thich');
    expect(await ratings.put(mine, id, 'KhongThich')).toEqual({
      loai: 'KhongThich',
      luotThich: 1,
      luotKhongThich: 1,
    });
    // Hai dòng (một của mỗi người), không phụ thuộc thứ tự mã Bệnh nhân
    const rows = await af.ratingRows(id);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        { benhNhanId: other, loai: 'Thich' },
        { benhNhanId: mine, loai: 'KhongThich' },
      ]),
    );
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 1,
      luotKhongThich: 1,
    });
  });

  it('ABR-04: PUT cùng loại lần nữa (nhiều lần) ⇒ 200, số đếm và dòng DB không đổi', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    const first = await ratings.put(patient, id, 'KhongThich');
    for (let again = 0; again < 3; again++)
      expect(await ratings.put(patient, id, 'KhongThich')).toEqual(first);
    expect(first).toEqual({
      loai: 'KhongThich',
      luotThich: 0,
      luotKhongThich: 1,
    });
    expect(await af.ratingRows(id)).toHaveLength(1);
  });

  it('ABR-05: DELETE ⇒ dòng bị xoá, số đếm −1; DELETE lần hai ⇒ 200 không đổi; phiếu của người khác còn nguyên', async () => {
    const [mine, other] = [await newPatient(), await newPatient()];
    const id = await newArticle();
    await ratings.put(other, id, 'Thich');
    await ratings.put(mine, id, 'Thich');
    expect(await ratings.remove(mine, id)).toEqual({
      loai: null,
      luotThich: 1,
      luotKhongThich: 0,
    });
    expect(await af.ratingOf(mine, id)).toBeNull();
    expect(await ratings.remove(mine, id)).toEqual({
      loai: null,
      luotThich: 1,
      luotKhongThich: 0,
    });
    expect(await af.ratingOf(other, id)).toBe('Thich');
  });

  it('ABR-05: DELETE khi CHƯA TỪNG đánh giá ⇒ 200 { loai: null } với số đếm hiện có, không lỗi', async () => {
    const [mine, other] = [await newPatient(), await newPatient()];
    const id = await newArticle();
    await ratings.put(other, id, 'KhongThich');
    expect(await ratings.remove(mine, id)).toEqual({
      loai: null,
      luotThich: 0,
      luotKhongThich: 1,
    });
    expect(await af.ratingRows(id)).toHaveLength(1);
  });

  it('ABR-02, ABR-05: phiếu theo từng bài độc lập: đánh giá bài này không đổi số của bài kia', async () => {
    const patient = await newPatient();
    const [first, second] = [await newArticle('Một'), await newArticle('Hai')];
    await ratings.put(patient, first, 'Thich');
    expect(await ratings.put(patient, second, 'KhongThich')).toEqual({
      loai: 'KhongThich',
      luotThich: 0,
      luotKhongThich: 1,
    });
    expect(await af.ratingTotals(first)).toEqual({
      luotThich: 1,
      luotKhongThich: 0,
    });
  });
});

describe('bài không công khai: 404 và không ghi gì (ABR-06)', () => {
  /** Dựng bài ở ba trạng thái, mỗi bài đã có sẵn một phiếu của người khác để thấy "không đổi gì". */
  async function nonPublicArticles(): Promise<Record<string, string>> {
    const draft = await af.published({
      tacGiaId: adminId,
      tieuDe: 'Bản nháp',
      trangThai: 'BanNhap',
      thoiDiemXuatBan: null,
    });
    const archived = await af.published({
      tacGiaId: adminId,
      tieuDe: 'Bản lưu trữ',
      trangThai: 'LuuTruAn',
    });
    return { BanNhap: draft, LuuTruAn: archived, KhongCo: '987654321' };
  }

  it('ABR-06: PUT, DELETE, GET trên BanNhap, LuuTruAn, id không có, id sai dạng ⇒ CÙNG một 404 KHONG_TIM_THAY, bảng không đổi', async () => {
    const patient = await newPatient();
    const targets = { ...(await nonPublicArticles()), SaiDang: 'abc' };
    const before = await af.rowCounts();
    const responses: unknown[] = [];
    for (const id of Object.values(targets))
      // Hàm trả promise (không tạo sẵn cả ba): promise bị từ chối phải được `await` ngay, nếu không Node báo "unhandled rejection"
      for (const call of [
        () => ratings.put(patient, id, 'Thich'),
        () => ratings.remove(patient, id),
        () => ratings.get(patient, id),
      ]) {
        const error: AppException = await rejection(call());
        expect(error.getStatus()).toBe(404);
        responses.push(error.getResponse());
      }
    expect(responses).toHaveLength(12);
    for (const body of responses) {
      expect(body).toMatchObject({ maLoi: NOT_FOUND });
      expect(body).toEqual(responses[0]);
    }
    expect(await af.rowCounts()).toEqual(before);
  });

  it('ABR-06 (A2 3c): bài đã có phiếu rồi bị ẩn ⇒ PUT và DELETE đều 404, phiếu GIỮ NGUYÊN (không đổi, không xoá); xuất bản lại thì dùng lại được', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    await ratings.put(patient, id, 'Thich');
    await setStatus(id, 'LuuTruAn');
    expect(
      (await rejection(ratings.put(patient, id, 'KhongThich'))).getStatus(),
    ).toBe(404);
    expect((await rejection(ratings.remove(patient, id))).getStatus()).toBe(
      404,
    );
    expect((await rejection(ratings.get(patient, id))).getStatus()).toBe(404);
    expect(await af.ratingOf(patient, id)).toBe('Thich');
    await setStatus(id, 'DaXuatBan');
    expect(await ratings.get(patient, id)).toEqual({ loai: 'Thich' });
    expect(await ratings.remove(patient, id)).toMatchObject({ loai: null });
  });
});

describe('ca cổng: Bệnh nhân đánh giá lúc Quản trị viên ẩn bài (ABR-07)', () => {
  it('ABR-07 chiều A: cổng dừng SAU câu khoá FOR SHARE của PUT ⇒ lệnh ẩn bài (FOR UPDATE) BỊ CHẶN tới khi PUT commit; phiếu ghi TRƯỚC khi ẩn (200), bài rồi mới bị ẩn', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    const gate = createGate();
    holdAfter(PatientRatingRepository.prototype, 'lockPublished', gate);
    const rating = ratings.put(patient, id, 'Thich');
    await waitUntilReached(gate, rating);
    const hiding = setStatus(id, 'LuuTruAn');
    await waitForBlockedStatement(
      db,
      '%FROM bai_viet WHERE bai_viet_id =%FOR UPDATE',
    );
    // Bài vẫn đang xuất bản vì lệnh ẩn chưa chạy được
    expect((await af.articleRow(id))?.trangThai).toBe('DaXuatBan');
    gate.open();
    const [result, hidden] = await Promise.all([rating, hiding]);
    expect(result).toEqual({ loai: 'Thich', luotThich: 1, luotKhongThich: 0 });
    expect(hidden.trangThai).toBe('LuuTruAn');
    expect(await af.ratingOf(patient, id)).toBe('Thich');
  });

  it('ABR-07 chiều B: Quản trị viên giữ khoá hàng bài ⇒ PUT BỊ CHẶN ở FOR SHARE; ẩn xong thì PUT nhận 404 và KHÔNG có phiếu nào ghi sau khi ẩn', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    const gate = createGate();
    holdAfter(ArticleAdminRepository.prototype, 'lock', gate);
    const hiding = setStatus(id, 'LuuTruAn');
    await waitUntilReached(gate, hiding);
    // `rejection` bắt lỗi ngay: PUT sẽ bị từ chối (404) sau khi cổng mở
    const rating = rejection(ratings.put(patient, id, 'Thich'));
    await waitForBlockedStatement(
      db,
      '%FROM bai_viet WHERE bai_viet_id =%FOR SHARE',
    );
    gate.open();
    const [, error] = await Promise.all([hiding, rating]);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ maLoi: NOT_FOUND });
    expect((await af.articleRow(id))?.trangThai).toBe('LuuTruAn');
    expect(await af.ratingRows(id)).toEqual([]);
    expect((await af.rowCounts()).benh_nhan_danh_gia_bai_viet).toBe(0);
  });
});

describe('đua (ABR-08)', () => {
  it('ABR-08 (i): hai tab của CÙNG Bệnh nhân gửi PUT cùng loại (ca cổng: tab A giữ khoá dòng phiếu sau INSERT, tab B chờ): cả hai 200, ĐÚNG MỘT dòng, không lỗi, số đếm = số dòng', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    const gate = createGate();
    holdAfter(PatientRatingRepository.prototype, 'upsert', gate);
    const a = ratings.put(patient, id, 'Thich');
    await waitUntilReached(gate, a);
    const b = ratings.put(patient, id, 'Thich');
    await waitForBlockedStatement(
      db,
      'INSERT INTO benh_nhan_danh_gia_bai_viet%',
    );
    gate.open();
    const [resultA, resultB] = await Promise.all([a, b]);
    expect(resultA).toEqual({ loai: 'Thich', luotThich: 1, luotKhongThich: 0 });
    expect(resultB).toEqual(resultA);
    expect(await af.ratingRows(id)).toHaveLength(1);
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 1,
      luotKhongThich: 0,
    });
  });

  it('ABR-08 (ii): PUT Thích với PUT Không thích của cùng người (tab B chờ tab A): loại của giao dịch commit SAU CÙNG thắng, một dòng, số đếm = số dòng, mỗi lời đáp khớp một thứ tự nối tiếp', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    const gate = createGate();
    holdAfter(PatientRatingRepository.prototype, 'upsert', gate);
    const a = ratings.put(patient, id, 'Thich');
    await waitUntilReached(gate, a);
    const b = ratings.put(patient, id, 'KhongThich');
    await waitForBlockedStatement(
      db,
      'INSERT INTO benh_nhan_danh_gia_bai_viet%',
    );
    gate.open();
    const [resultA, resultB] = await Promise.all([a, b]);
    expect(resultA).toEqual({ loai: 'Thich', luotThich: 1, luotKhongThich: 0 });
    expect(resultB).toEqual({
      loai: 'KhongThich',
      luotThich: 0,
      luotKhongThich: 1,
    });
    expect(await af.ratingRows(id)).toEqual([
      { benhNhanId: patient, loai: 'KhongThich' },
    ]);
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 0,
      luotKhongThich: 1,
    });
  });

  it(`ABR-08 (iii): ${RACE_SIZE} PUT xen kẽ hai loại của cùng người chạy song song, ${RACE_ROUNDS} vòng: không lỗi nào (không 1213, không 1062, không 500), mỗi vòng ĐÚNG một dòng, mỗi lời đáp có tổng 1 khớp loại của nó`, async () => {
    const patient = await newPatient();
    const id = await newArticle();
    for (let round = 1; round <= RACE_ROUNDS; round++) {
      await db.query(
        'DELETE FROM benh_nhan_danh_gia_bai_viet WHERE bai_viet_id = ?',
        [id],
      );
      const kinds = Array.from({ length: RACE_SIZE }, (_, index) =>
        index % 2 === 0 ? ('Thich' as const) : ('KhongThich' as const),
      );
      const results = await Promise.all(
        kinds.map((loai) => ratings.put(patient, id, loai)),
      );
      const where = `vòng ${round}`;
      expect(await af.ratingRows(id), where).toHaveLength(1);
      const totals = await af.ratingTotals(id);
      expect(totals.luotThich + totals.luotKhongThich, where).toBe(1);
      // Loại cuối cùng trong DB là loại của MỘT trong các lời gọi
      const last = (await af.ratingRows(id))[0]?.loai;
      expect(kinds, where).toContain(last);
      for (const [index, result] of results.entries()) {
        const mine = kinds[index];
        expect(result.loai, where).toBe(mine);
        // Giao dịch giữ khoá dòng tới commit nên mỗi lời đáp thấy đúng phiếu của chính nó
        expect(result.luotThich + result.luotKhongThich, where).toBe(1);
        expect(
          mine === 'Thich' ? result.luotThich : result.luotKhongThich,
          where,
        ).toBe(1);
      }
    }
  });

  it('ABR-08 (iv): nhiều Bệnh nhân khác nhau đánh giá CÙNG một bài song song (S + S không chặn nhau): không lỗi, số đếm đủ', async () => {
    const id = await newArticle();
    const patients = await Promise.all(
      Array.from({ length: 6 }, () => newPatient()),
    );
    await Promise.all(
      patients.map((patient, index) =>
        ratings.put(patient, id, index < 4 ? 'Thich' : 'KhongThich'),
      ),
    );
    expect(await af.ratingRows(id)).toHaveLength(6);
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 4,
      luotKhongThich: 2,
    });
    expect(await ratings.put(patients[0]!, id, 'Thich')).toEqual({
      loai: 'Thich',
      luotThich: 4,
      luotKhongThich: 2,
    });
  });
});

describe('số đếm ở chi tiết công khai (ABR-09)', () => {
  it('ABR-09: nhiều Bệnh nhân ⇒ luotThich, luotKhongThich đúng và là SỐ; bài chưa ai bấm ⇒ 0 và 0; đổi và thu hồi được phản ánh', async () => {
    const id = await newArticle();
    const empty = await newArticle('Chưa ai bấm');
    const patients = await Promise.all(
      Array.from({ length: 5 }, () => newPatient()),
    );
    for (const [index, patient] of patients.entries())
      await ratings.put(patient, id, index < 3 ? 'Thich' : 'KhongThich');
    const detail = await publicArticles.detail(id);
    expect(detail).toMatchObject({ luotThich: 3, luotKhongThich: 2 });
    expect(typeof detail.luotThich).toBe('number');
    expect(await publicArticles.detail(empty)).toMatchObject({
      luotThich: 0,
      luotKhongThich: 0,
    });
    await ratings.put(patients[0]!, id, 'KhongThich');
    await ratings.remove(patients[1]!, id);
    expect(await publicArticles.detail(id)).toMatchObject({
      luotThich: 1,
      luotKhongThich: 3,
    });
  });

  it('ABR-09 (2.4.55 A2 3c): ẩn bài KHÔNG xoá phiếu: chi tiết 404 trong lúc ẩn, xuất bản lại thì số CŨ hiện lại nguyên vẹn', async () => {
    const id = await newArticle();
    const patients = await Promise.all(
      Array.from({ length: 4 }, () => newPatient()),
    );
    for (const [index, patient] of patients.entries())
      await ratings.put(patient, id, index === 0 ? 'KhongThich' : 'Thich');
    const before = await publicArticles.detail(id);
    await setStatus(id, 'LuuTruAn');
    expect((await rejection(publicArticles.detail(id))).getStatus()).toBe(404);
    expect(await af.ratingRows(id)).toHaveLength(4);
    await setStatus(id, 'DaXuatBan');
    const after = await publicArticles.detail(id);
    expect(after).toMatchObject({ luotThich: 3, luotKhongThich: 1 });
    // Ngoài hai khoá mới, mọi khoá cũ (kể cả thời điểm xuất bản, đặt MỘT lần) không đổi
    expect(after).toEqual(before);
  });

  it('ABR-09 (cùng ảnh chụp): phiếu commit bằng kết nối KHÁC sau câu chi tiết và trước câu đếm KHÔNG lọt vào số đếm (cả ba câu chạy trong MỘT giao dịch chỉ đọc)', async () => {
    const id = await newArticle();
    const [first, late] = [await newPatient(), await newPatient()];
    await ratings.put(first, id, 'Thich');
    const managers = new Set<unknown>();
    const statements = captureSql(async (sql, manager) => {
      managers.add(manager);
      if (sql.includes('noi_dung')) await af.rating(late, id, 'Thich');
    });
    expect(await publicArticles.detail(id)).toMatchObject({
      luotThich: 1,
      luotKhongThich: 0,
    });
    // Phiếu của người trễ đã thật sự được ghi (đối chứng: ca có hiệu lực), chỉ là ảnh chụp không thấy
    expect(await af.ratingTotals(id)).toEqual({
      luotThich: 2,
      luotKhongThich: 0,
    });
    expect(statements).toHaveLength(3);
    expect(statements[2]).toContain('benh_nhan_danh_gia_bai_viet');
    expect(managers.size).toBe(1);
  });

  it('ABR-09: danh sách công khai KHÔNG có số đếm (MH17): các khoá của một bài đúng như B2', async () => {
    const id = await newArticle();
    await ratings.put(await newPatient(), id, 'Thich');
    const page = await publicArticles.list(new PublicArticleListQueryDto());
    expect(Object.keys(page.items[0]!).sort()).toEqual(
      [
        'anhDaiDien',
        'baiVietId',
        'hashtag',
        'moTaNgan',
        'thoiDiemXuatBan',
        'tieuDe',
      ].sort(),
    );
  });
});

describe('phiếu của chính mình (ABR-10)', () => {
  it('ABR-10: GET chưa đánh giá ⇒ { loai: null }; sau PUT ⇒ loại đó; người khác KHÔNG thấy phiếu của mình; DELETE của người khác không đụng phiếu của mình', async () => {
    const [mine, other] = [await newPatient(), await newPatient()];
    const id = await newArticle();
    expect(await ratings.get(mine, id)).toEqual({ loai: null });
    await ratings.put(mine, id, 'KhongThich');
    expect(await ratings.get(mine, id)).toEqual({ loai: 'KhongThich' });
    const seenByOther = await ratings.get(other, id);
    expect(seenByOther).toEqual({ loai: null });
    expect(JSON.stringify(seenByOther)).not.toContain(mine);
    await ratings.remove(other, id);
    expect(await ratings.get(mine, id)).toEqual({ loai: 'KhongThich' });
    await ratings.put(other, id, 'Thich');
    expect(await ratings.get(mine, id)).toEqual({ loai: 'KhongThich' });
    expect(await ratings.get(other, id)).toEqual({ loai: 'Thich' });
  });

  it('ABR-10: GET đổi theo PUT đổi loại và theo DELETE (đọc sau ghi thấy ngay)', async () => {
    const patient = await newPatient();
    const id = await newArticle();
    await ratings.put(patient, id, 'Thich');
    await ratings.put(patient, id, 'KhongThich');
    expect(await ratings.get(patient, id)).toEqual({ loai: 'KhongThich' });
    await ratings.remove(patient, id);
    expect(await ratings.get(patient, id)).toEqual({ loai: null });
  });
});

import { ApiError, NetworkError } from '../../../shared/api/errors';
import {
  ARTICLE_ERROR,
  ARTICLE_ERROR_FIELD,
  articleErrorText,
  collectErrorCodes,
  readExistingTag,
} from './article-errors';

// article F1, ABW-05 (phần mã lỗi và chữ): web chọn chữ theo MÃ, không theo `thongBao` của máy chủ (PLAN 5.8).
const fieldError = (ma: string, truong = 'tieuDe') =>
  new ApiError(400, {
    maLoi: ARTICLE_ERROR.invalidData,
    thongBao: 'bất kỳ',
    loi: [{ truong, ma }],
  });

describe('collectErrorCodes (ABW-05)', () => {
  it('ABW-05 lấy cả maLoi lẫn mọi loi[].ma theo thứ tự, bỏ trùng', () => {
    const error = new ApiError(400, {
      maLoi: ARTICLE_ERROR.invalidData,
      thongBao: 'x',
      loi: [
        { truong: 'tieuDe', ma: ARTICLE_ERROR.title },
        { truong: 'hashtag', ma: ARTICLE_ERROR.tooManyTags },
        { truong: 'hashtag', ma: ARTICLE_ERROR.tooManyTags },
      ],
    });
    expect(collectErrorCodes(error)).toEqual([
      'DU_LIEU_KHONG_HOP_LE',
      'TIEU_DE_KHONG_HOP_LE',
      'QUA_NHIEU_THE',
    ]);
  });

  it('ABW-05 lỗi nghiệp vụ chỉ có maLoi (không có loi[])', () => {
    const error = new ApiError(409, {
      maLoi: ARTICLE_ERROR.tagDisabled,
      thongBao: 'x',
    });
    expect(collectErrorCodes(error)).toEqual(['THE_DA_TAT']);
  });

  it.each([
    ['NetworkError', new NetworkError()],
    ['Error thường', new Error('x')],
    ['chuỗi', 'THE_DA_TAT'],
    ['null', null],
  ])('ABW-05 %s không phải ApiError ⇒ không có mã', (_label, error) => {
    expect(collectErrorCodes(error)).toEqual([]);
  });
});

describe('readExistingTag (ABW-05)', () => {
  const withDetail = (chiTiet: unknown) =>
    new ApiError(409, {
      maLoi: ARTICLE_ERROR.tagAccentConflict,
      thongBao: 'x',
      chiTiet,
    });

  it('ABW-05 đọc chiTiet.theDaCo', () => {
    expect(readExistingTag(withDetail({ theDaCo: 'mặt' }))).toBe('mặt');
  });

  it.each([
    ['không có chiTiet', undefined],
    ['null', null],
    ['chuỗi', 'mặt'],
    ['mảng', ['mặt']],
    ['thiếu theDaCo', { khac: 'mặt' }],
    ['theDaCo không phải chuỗi', { theDaCo: 5 }],
    ['theDaCo rỗng', { theDaCo: '' }],
  ])('ABW-05 %s ⇒ null', (_label, chiTiet) => {
    expect(readExistingTag(withDetail(chiTiet))).toBeNull();
  });

  it('ABW-05 không phải ApiError ⇒ null', () => {
    expect(readExistingTag(new NetworkError())).toBeNull();
    expect(readExistingTag({ chiTiet: { theDaCo: 'a' } })).toBeNull();
  });
});

describe('chữ theo mã (ABW-05, PLAN 5.8 nguyên văn)', () => {
  it.each([
    [ARTICLE_ERROR.title, 'Tiêu đề không được để trống và tối đa 255 ký tự.'],
    [ARTICLE_ERROR.summaryTooLong, 'Mô tả ngắn tối đa 500 ký tự.'],
    // mã B1 thêm sau PLAN 5.8; chữ mới theo mẫu của NOI_DUNG_KHONG_HOP_LE (Đại sửa được lúc review)
    [ARTICLE_ERROR.summaryInvalid, 'Mô tả ngắn có ký tự không hợp lệ.'],
    [ARTICLE_ERROR.contentTooLong, 'Nội dung quá dài (tối đa 20.000 ký tự).'],
    [ARTICLE_ERROR.contentInvalid, 'Nội dung có ký tự không hợp lệ.'],
    [
      ARTICLE_ERROR.contentRequiredToPublish,
      'Cần có nội dung trước khi xuất bản.',
    ],
    [ARTICLE_ERROR.statusInvalid, 'Không tạo bài mới ở trạng thái lưu trữ.'],
    [
      ARTICLE_ERROR.tagInvalid,
      'Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự).',
    ],
    [ARTICLE_ERROR.tooManyTags, 'Tối đa 10 thẻ mỗi bài.'],
  ])('ABW-05 %s ⇒ %s', (code, text) => {
    expect(articleErrorText(code)).toBe(text);
  });

  it('ABW-05 THE_TRUNG_KHONG_DAU và THE_DA_TAT điền tên thẻ đã có', () => {
    expect(articleErrorText(ARTICLE_ERROR.tagAccentConflict, 'mặt')).toBe(
      'Đã có thẻ “mặt” (khác dấu). Hãy dùng thẻ này.',
    );
    expect(articleErrorText(ARTICLE_ERROR.tagDisabled, 'mặt')).toBe(
      'Thẻ “mặt” đã bị tắt, chưa dùng lại được.',
    );
  });

  it.each([undefined, null, ''])(
    'ABW-05 hai câu về thẻ thiếu tên thẻ (%j) ⇒ undefined, không in "{theDaCo}"',
    (theDaCo) => {
      expect(
        articleErrorText(ARTICLE_ERROR.tagAccentConflict, theDaCo),
      ).toBeUndefined();
      expect(
        articleErrorText(ARTICLE_ERROR.tagDisabled, theDaCo),
      ).toBeUndefined();
    },
  );

  it('ABW-05 mã không có chữ riêng (403, 404, 413, mã lạ) ⇒ undefined để nơi gọi dùng chữ chung', () => {
    for (const code of [
      ARTICLE_ERROR.forbidden,
      ARTICLE_ERROR.notFound,
      ARTICLE_ERROR.payloadTooLarge,
      ARTICLE_ERROR.invalidData,
      'MA_LA',
    ]) {
      expect(articleErrorText(code)).toBeUndefined();
    }
  });

  it.each([
    ARTICLE_ERROR.invalidArticleId,
    ARTICLE_ERROR.invalidKeyword,
    ARTICLE_ERROR.invalidPage,
    ARTICLE_ERROR.fieldNotAllowed,
  ])(
    'ABW-05 mã B1 hầu như không gặp ở web (%s) ⇒ không chữ riêng, không gắn ô nào: rơi vào nhánh "mã lạ" (dải báo chung)',
    (code) => {
      expect(articleErrorText(code, 'x')).toBeUndefined();
      expect(ARTICLE_ERROR_FIELD[code]).toBeUndefined();
    },
  );

  it('ABW-05 bốn mã mới của B1 có đúng tên theo hợp đồng', () => {
    expect([
      ARTICLE_ERROR.invalidArticleId,
      ARTICLE_ERROR.invalidKeyword,
      ARTICLE_ERROR.invalidPage,
      ARTICLE_ERROR.fieldNotAllowed,
      ARTICLE_ERROR.summaryInvalid,
    ]).toEqual([
      'MA_BAI_VIET_KHONG_HOP_LE',
      'TU_KHOA_KHONG_HOP_LE',
      'TRANG_KHONG_HOP_LE',
      'TRUONG_KHONG_DUOC_PHEP',
      'MO_TA_KHONG_HOP_LE',
    ]);
  });

  it('ABW-05 chữ lấy theo mã, không theo thongBao của máy chủ', () => {
    const [code] = collectErrorCodes(
      new ApiError(400, {
        maLoi: ARTICLE_ERROR.tooManyTags,
        thongBao: 'Câu của máy chủ',
      }),
    );
    expect(articleErrorText(code)).toBe('Tối đa 10 thẻ mỗi bài.');
  });
});

describe('ô nhận lỗi (ABW-05)', () => {
  it.each([
    [ARTICLE_ERROR.title, 'tieuDe'],
    [ARTICLE_ERROR.summaryTooLong, 'moTaNgan'],
    [ARTICLE_ERROR.summaryInvalid, 'moTaNgan'],
    [ARTICLE_ERROR.contentTooLong, 'noiDung'],
    [ARTICLE_ERROR.contentInvalid, 'noiDung'],
    [ARTICLE_ERROR.contentRequiredToPublish, 'noiDung'],
    [ARTICLE_ERROR.statusInvalid, 'trangThai'],
    [ARTICLE_ERROR.tagInvalid, 'hashtag'],
    [ARTICLE_ERROR.tooManyTags, 'hashtag'],
    [ARTICLE_ERROR.tagAccentConflict, 'hashtag'],
    [ARTICLE_ERROR.tagDisabled, 'hashtag'],
  ])('ABW-05 %s gắn vào ô %s', (code, field) => {
    expect(ARTICLE_ERROR_FIELD[code]).toBe(field);
  });

  it('ABW-05 mã có chữ riêng ⇔ mã có ô nhận; mã chung (403, 404, 413, DU_LIEU_KHONG_HOP_LE) không gắn ô nào', () => {
    const withText = Object.values(ARTICLE_ERROR).filter(
      (code) => articleErrorText(code, 'x') !== undefined,
    );
    expect(withText.sort()).toEqual(Object.keys(ARTICLE_ERROR_FIELD).sort());
    for (const code of [
      ARTICLE_ERROR.invalidData,
      ARTICLE_ERROR.forbidden,
      ARTICLE_ERROR.notFound,
      ARTICLE_ERROR.payloadTooLarge,
    ]) {
      expect(ARTICLE_ERROR_FIELD[code]).toBeUndefined();
    }
  });

  it('ABW-05 mã theo ô đọc được từ loi[].ma của lỗi 400', () => {
    const codes = collectErrorCodes(fieldError(ARTICLE_ERROR.summaryTooLong));
    expect(
      codes.map((code) => ARTICLE_ERROR_FIELD[code]).filter(Boolean),
    ).toEqual(['moTaNgan']);
  });
});

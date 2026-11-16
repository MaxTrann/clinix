import { describe, expect, it } from 'vitest';
import { RATING_TEXT, ratingLabel, starName } from './rating-text';

// doctor-exam F6, WDG-16 [đề xuất]: chữ của khối "Đánh giá bác sĩ" (Figma `422:2`, `423:2`, `424:2`; chữ [đề xuất] do Đại duyệt TRỰC TIẾP 16/11/2026) và nhãn mức sao 1 đến 5. Giá trị viết NGUYÊN VĂN.
describe('WDG-16 nhãn mức sao và tên truy cập', () => {
  it('năm nhãn: 1 Rất tệ, 2 Tệ, 3 Bình thường, 4 Tốt, 5 Xuất sắc (Figma chỉ có "Xuất sắc")', () => {
    expect([1, 2, 3, 4, 5].map(ratingLabel)).toEqual([
      'Rất tệ',
      'Tệ',
      'Bình thường',
      'Tốt',
      'Xuất sắc',
    ]);
  });

  it('ngoài miền hay không nguyên ⇒ null (không in nhãn bịa, không "undefined")', () => {
    for (const value of [0, 6, -1, 3.5, NaN, Infinity]) {
      expect(ratingLabel(value)).toBeNull();
    }
  });

  it('tên truy cập của ô sao là "1 sao" … "5 sao"', () => {
    expect([1, 2, 3, 4, 5].map(starName)).toEqual([
      '1 sao',
      '2 sao',
      '3 sao',
      '4 sao',
      '5 sao',
    ]);
  });
});

describe('WDG-16 chữ đã duyệt', () => {
  it('chữ có trong Figma', () => {
    expect(RATING_TEXT.title).toBe('Đánh giá bác sĩ');
    expect(RATING_TEXT.notRated).toBe(
      'Bạn chưa đánh giá bác sĩ cho buổi khám này.',
    );
    expect(RATING_TEXT.rateNow).toBe('Đánh giá ngay');
    expect(RATING_TEXT.starsLegend).toBe('Số sao');
    expect(RATING_TEXT.cancel).toBe('Huỷ');
    expect(RATING_TEXT.submit).toBe('Gửi đánh giá');
  });

  it('nhận xét TUỲ CHỌN (L1, Đại 16/11/2026): nhãn "Nhận xét" kèm "(tuỳ chọn)", gợi ý không còn "tối thiểu 10 ký tự"', () => {
    expect(RATING_TEXT.commentLabel).toBe('Nhận xét');
    expect(RATING_TEXT.optional).toBe('(tuỳ chọn)');
    expect(RATING_TEXT.commentPlaceholder).toBe('Chia sẻ trải nghiệm của bạn');
    expect(RATING_TEXT.commentPlaceholder).not.toContain('10 ký tự');
  });

  it('chữ [đề xuất] đã được Đại duyệt (L8)', () => {
    expect(RATING_TEXT.submitting).toBe('Đang gửi...');
    expect(RATING_TEXT.starsRequired).toBe('Vui lòng chọn số sao.');
    expect(RATING_TEXT.tooLong).toBe('Tối đa 1.000 ký tự.');
    expect(RATING_TEXT.already).toBe('Bạn đã đánh giá buổi khám này.');
    expect(RATING_TEXT.notCompleted).toBe(
      'Chỉ đánh giá được ca khám đã hoàn thành.',
    );
    expect(RATING_TEXT.notFound).toBe('Không tìm thấy ca khám này.');
    expect(RATING_TEXT.busy).toBe('Hệ thống đang bận, thử lại sau ít phút.');
    expect(RATING_TEXT.sent).toBe('Đã gửi đánh giá của bạn.');
  });
});

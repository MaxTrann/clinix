import { ratingLabel } from './suggest-format';

// Chatbot F2, F2-10: điểm đánh giá của bác sĩ. Giờ và ngày của ô giờ ở `suggest-dates.test.ts` (F2-08, nhiều múi giờ).
describe('ratingLabel', () => {
  it('F2-10 có đánh giá thì hiện điểm một chữ số thập phân và số lượt', () => {
    expect(ratingLabel({ diemTrungBinh: '4.5', soDanhGia: 12 })).toBe(
      '4.5 · 12 đánh giá',
    );
    expect(ratingLabel({ diemTrungBinh: '4', soDanhGia: 1 })).toBe(
      '4.0 · 1 đánh giá',
    );
    expect(ratingLabel({ diemTrungBinh: '4.25', soDanhGia: 8 })).toBe(
      '4.3 · 8 đánh giá',
    );
  });

  it('F2-10 chưa có đánh giá (điểm null hay 0 lượt) thì ẩn', () => {
    expect(ratingLabel({ diemTrungBinh: null, soDanhGia: 0 })).toBeNull();
    expect(ratingLabel({ diemTrungBinh: null, soDanhGia: 3 })).toBeNull();
    expect(ratingLabel({ diemTrungBinh: '4.5', soDanhGia: 0 })).toBeNull();
  });
});

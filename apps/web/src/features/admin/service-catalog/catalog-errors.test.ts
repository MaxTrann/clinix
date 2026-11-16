import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { feedbackFor } from './catalog-errors';

// AF3-10 (admin PR2 mục 6.2): lỗi gắn với ô nào thì CHỈ hiện dưới ô đó. `feedbackFor` trả `message: ''` cho lỗi đã gắn ô; banner chỉ
// dành cho lỗi không gắn ô (403, 404, mạng, hết giờ, lỗi chung, xóa nhóm còn dịch vụ).

function apiError(maLoi: string, status = 409, loi?: ApiError['loi']) {
  return new ApiError(status, { maLoi, thongBao: 'x', loi });
}

describe('feedbackFor: lỗi gắn ô thì không có banner (AF3-10)', () => {
  it.each([
    ['TEN_NHOM_DICH_VU_TRUNG', 'ten', 'Tên nhóm dịch vụ đã tồn tại.'],
    ['TEN_DICH_VU_TRUNG', 'ten', 'Tên dịch vụ đã tồn tại trong nhóm này.'],
    [
      'NHOM_DICH_VU_KHONG_TON_TAI',
      'nhomDichVuId',
      'Nhóm dịch vụ không còn tồn tại. Hãy chọn nhóm khác.',
    ],
    [
      'THOI_LUONG_DANG_DUNG',
      'thoiLuong',
      'Không thể đổi thời lượng vì dịch vụ đang được lịch hẹn hoặc khung giờ sử dụng.',
    ],
  ])('AF3-10 %s: chữ chỉ ở ô %s, không banner', (maLoi, field, text) => {
    const feedback = feedbackFor(apiError(maLoi));

    expect(feedback.fields).toEqual({ [field]: text });
    expect(feedback.message).toBe('');
  });

  it('AF3-10 DU_LIEU_KHONG_HOP_LE có ô nhận ra được: chỉ dưới ô, không có câu "Vui lòng kiểm tra lại…"', () => {
    const feedback = feedbackFor(
      apiError('DU_LIEU_KHONG_HOP_LE', 400, [
        { truong: 'ten', ma: 'TEN_DICH_VU_KHONG_HOP_LE' },
        { truong: 'giaMacDinh', ma: 'GIA_MAC_DINH_KHONG_HOP_LE' },
      ]),
    );

    expect(feedback.fields).toEqual({
      ten: 'Tên dịch vụ cần có từ 1 đến 100 ký tự.',
      giaMacDinh: 'Giá phải là số nguyên đồng lớn hơn 0.',
    });
    expect(feedback.message).toBe('');
  });

  it('AF3-10 DU_LIEU_KHONG_HOP_LE không ô nào nhận ra được: banner chung, vì không còn chỗ nào khác để báo', () => {
    const feedback = feedbackFor(
      apiError('DU_LIEU_KHONG_HOP_LE', 400, [{ truong: 'la', ma: 'LA' }]),
    );

    expect(feedback.fields).toEqual({});
    expect(feedback.message).toBe(
      'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    );
  });

  it('AF3-10 DU_LIEU_KHONG_HOP_LE không có danh sách lỗi: banner chung', () => {
    expect(feedbackFor(apiError('DU_LIEU_KHONG_HOP_LE', 400)).message).toBe(
      'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    );
  });
});

describe('feedbackFor: lỗi không gắn ô thì có banner (AF3-10)', () => {
  it('AF3-10 xóa nhóm còn dịch vụ: banner, không ô', () => {
    const feedback = feedbackFor(apiError('NHOM_DICH_VU_CON_DICH_VU'));

    expect(feedback.fields).toEqual({});
    expect(feedback.message).toBe(
      'Không thể xóa nhóm đang có dịch vụ. Hãy chuyển dịch vụ sang nhóm khác trước.',
    );
  });

  it.each([
    [403, 'Bạn không có quyền thực hiện thao tác này.'],
    [404, 'Dữ liệu không còn tồn tại. Hãy tải lại danh sách.'],
    [500, 'Không lưu được dữ liệu. Vui lòng thử lại.'],
  ])('AF3-10 HTTP %i: banner, không ô', (status, message) => {
    const feedback = feedbackFor(apiError('LOI_KHAC', status));

    expect(feedback).toEqual({ message, fields: {} });
  });

  it('AF3-10 mất kết nối và hết giờ: banner theo câu chung của API client', () => {
    expect(feedbackFor(new NetworkError())).toEqual({
      message: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
      fields: {},
    });
    expect(feedbackFor(new TimeoutError())).toEqual({
      message: 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
      fields: {},
    });
  });

  it('AF3-10 lỗi lạ (không phải ApiError): banner chung', () => {
    const feedback = feedbackFor(new Error('boom'));

    expect(feedback.fields).toEqual({});
    expect(feedback.message).not.toBe('');
  });
});

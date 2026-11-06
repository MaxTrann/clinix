import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { ParseRelativeIdPipe } from './relative-id.pipe.js';

// Task B4 — id hồ sơ người thân trên đường dẫn (PLAN patient Q27; TRACKING B4-B). Mã ca RUP-nn là [đề xuất] (TRACKING B4-G).
// Nối dây vào route thật (thứ tự với thân, guard trước pipe, ngoại lệ `%` hỏng): test/patient-relatives-update.e2e-spec.ts và relatives.controller.update.spec.ts.
const pipe = new ParseRelativeIdPipe();

function thrown(value: string): unknown {
  try {
    pipe.transform(value);
  } catch (error) {
    return error;
  }
  return null;
}

describe('ParseRelativeIdPipe', () => {
  it.each(['1', '42', '9007199254740993', '9223372036854775807'])(
    'RUP-01 (Q27) id hợp lệ %s ⇒ trả đúng chuỗi đó (kiểu string, không Number)',
    (id) => {
      const result: unknown = pipe.transform(id);

      expect(result).toBe(id);
      expect(typeof result).toBe('string');
    },
  );

  it.each<[string, string]>([
    ['0', '0'],
    ['-1', '-1'],
    ['+1', '+1'],
    ['1.5', '1.5'],
    ['1e3', '1e3'],
    ['dấu cách đầu', ' 1'],
    ['dấu cách cuối', '1 '],
    ['số 0 đứng đầu', '01'],
    ['chữ số Ả Rập', '٣'],
    ['chữ số toàn chiều rộng', '１'],
    ['xuống dòng cuối', '1\n'],
    ['xuống dòng đầu', '\n1'],
    ['ký tự NUL', '1\u0000'],
    ['abc', 'abc'],
    ['chuỗi rỗng', ''],
    ['null', 'null'],
    ['undefined', 'undefined'],
    ['tràn BIGINT', '9223372036854775808'],
    ['20 chữ số', '12345678901234567890'],
    ['5000 ký tự x', 'x'.repeat(5000)],
    ['5000 chữ số 9', '9'.repeat(5000)],
  ])(
    'RUP-02 (Q27, NT-08) id sai dạng (%s) ⇒ AppException 404 KHONG_TIM_THAY',
    (_label, id) => {
      const error = thrown(id);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(404);
      expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    },
  );

  it('RUP-03 (Q27, H3) thân 404 của Pipe BẰNG từng chữ thân 404 mặc định mà service ném cho "không có" và "của người khác"', () => {
    const fromService = new AppException(
      404,
      COMMON_ERROR_CODES.NOT_FOUND,
    ).getResponse();

    for (const id of ['0', '1.5', 'abc', '9223372036854775808', '01']) {
      expect((thrown(id) as AppException).getResponse()).toStrictEqual(
        fromService,
      );
    }
    expect(fromService).toStrictEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
  });
});

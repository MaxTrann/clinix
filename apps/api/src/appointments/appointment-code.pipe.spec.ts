import { AppException } from '../common/errors/app.exception.js';
import { toErrorResponse } from '../common/errors/all-exceptions.filter.js';
import { ParseAppointmentCodePipe } from './appointment-code.pipe.js';

// Task B2 — LSH-21 [đề xuất], QB-09 (PLAN booking 7.4, 7.9; TRACKING 3.15.3): Pipe của `:maLichHen`. Phần HTTP (guard trước pipe, thân 404 từng ký tự): e2e.
const CODE = 'CLX-20261110-7K3QD';
// Thân 404 chung của dự án (cùng chuỗi với `NOT_FOUND_TEXT` của patient): giống từng ký tự ở mọi nhánh
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

const pipe = new ParseAppointmentCodePipe();

function rejection(raw: string): unknown {
  try {
    pipe.transform(raw);
  } catch (error) {
    return error;
  }
  throw new Error(`Pipe không từ chối ${JSON.stringify(raw.slice(0, 30))}`);
}

describe('LSH-21 ParseAppointmentCodePipe', () => {
  it('mã đúng dạng đi qua nguyên vẹn; chữ thường và khoảng trắng được chuẩn hoá và trả mã chuẩn hoá', () => {
    expect(pipe.transform(CODE)).toBe(CODE);
    expect(pipe.transform(CODE.toLowerCase())).toBe(CODE);
    expect(pipe.transform(` ${CODE.toLowerCase()}\t`)).toBe(CODE);
  });

  it.each([
    'CLX-20261110-IBCDE',
    'CLX-20261110-7K3Q',
    'clx-2026-7k3qd',
    '',
    '   ',
    '0',
    '1; DROP TABLE lich_hen',
    "' OR 1=1 --",
    'CLX-20261110-ABCDſ',
    'A'.repeat(10_000),
  ])(
    'QB-09 sai dạng %j ⇒ AppException 404 KHONG_TIM_THAY (không bao giờ 400)',
    (raw) => {
      const error = rejection(raw);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(404);
      expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    },
  );

  it('QB-09 thân 404 của mọi mã sai dạng GIỐNG HỆT nhau và đúng thân hằng của dự án (so từng ký tự sau khi qua bộ lọc lỗi)', () => {
    const bodies = ['IBCDE', '', 'x'.repeat(5000), 'CLX-20261110-7K3QDX'].map(
      (raw) => JSON.stringify(toErrorResponse(rejection(raw)).body),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toBe(JSON.stringify(NOT_FOUND_BODY));
    expect(toErrorResponse(rejection('x')).status).toBe(404);
  });
});

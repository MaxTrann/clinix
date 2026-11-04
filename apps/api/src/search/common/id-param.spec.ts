import { AppException } from '../../common/errors/app.exception.js';
import { parsePublicId } from './id-param.js';

describe('P1 — parsePublicId (id sai dạng ⇒ 404)', () => {
  it.each(['1', '42', '9223372036854775807'])('chấp nhận %s', (id) =>
    expect(parsePublicId(id)).toBe(id),
  );

  it.each([
    '0',
    '-1',
    '01',
    '1.5',
    '1e3',
    'abc',
    '',
    ' 1',
    '9223372036854775808',
    '99999999999999999999',
  ])('từ chối %j bằng 404 KHONG_TIM_THAY', (id) => {
    let error: unknown;
    try {
      parsePublicId(id);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
  });
});

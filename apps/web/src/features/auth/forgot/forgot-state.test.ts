import { flowFromState, routeStateFor, type Flow } from './forgot-state';

// Task F4. Mã ca QS-nn là [đề xuất].
const marks = {
  hetHanLuc: '2026-11-03T10:10:00.000Z',
  coTheGuiLaiLuc: '2026-11-03T10:01:00.000Z',
};

describe('routeStateFor: chỉ thứ không bí mật', () => {
  it('QS-01 bước 3 ghi như bước 2: KHÔNG có resetToken', () => {
    const flow: Flow = {
      step: 'password',
      email: 'a@b.vn',
      marks,
      resetToken: 'reset-bi-mat',
    };
    const state = routeStateFor(flow);
    expect(state).toStrictEqual({ stage: 'code', email: 'a@b.vn', ...marks });
    expect(JSON.stringify(state)).not.toContain('reset-bi-mat');
  });

  it('QS-02 bước 1 chỉ có email (không mang câu thông báo)', () => {
    expect(
      routeStateFor({ step: 'email', email: 'a@b.vn', notice: 'câu' }),
    ).toStrictEqual({ email: 'a@b.vn' });
  });

  it('QS-03 bước 2 không mang cờ fresh hay mailFailed', () => {
    expect(
      routeStateFor({
        step: 'code',
        email: 'a@b.vn',
        marks,
        fresh: true,
        mailFailed: true,
      }),
    ).toStrictEqual({ stage: 'code', email: 'a@b.vn', ...marks });
  });
});

describe('flowFromState: đọc lại luôn theo đồng hồ máy', () => {
  it('QS-10 stage code: fresh false, mốc thiếu thì null', () => {
    expect(
      flowFromState({ stage: 'code', email: 'a@b.vn', hetHanLuc: 5 }),
    ).toStrictEqual({
      step: 'code',
      email: 'a@b.vn',
      marks: { hetHanLuc: null, coTheGuiLaiLuc: null },
      fresh: false,
      mailFailed: false,
    });
  });

  it('QS-12 stage done đủ cờ nhưng thiếu email: về bước 1, không vào Hoàn tất', () => {
    expect(
      flowFromState({
        stage: 'done',
        taiKhoanNgung: false,
        canDangKyLai: false,
      }),
    ).toStrictEqual({ step: 'email', email: '', notice: null });
  });

  it('QS-11 state null: bước 1 email rỗng', () => {
    expect(flowFromState(null)).toStrictEqual({
      step: 'email',
      email: '',
      notice: null,
    });
  });
});

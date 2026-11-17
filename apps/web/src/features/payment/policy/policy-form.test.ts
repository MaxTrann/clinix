import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../../../shared/api/errors';
import {
  DEFAULT_TIERS,
  MAX_TIERS,
  buildInput,
  depositExceedsPrice,
  depositInput,
  draftFromPolicy,
  emptyTier,
  isZeroAmount,
  noRefundWarning,
  saveFeedbackFor,
  templateTiers,
  type PolicyDraft,
} from './policy-form';

// payment F5: phần biểu mẫu thuần của màn "Đặt cọc & Hoàn tiền". Mã WCP theo PLAN payment 7.20. Dữ liệu giả.
const draft = (deposit: string, tiers: [string, string][]): PolicyDraft => ({
  deposit,
  tiers: tiers.map(([hours, rate], key) => ({ key, hours, rate })),
});
const PRICE = '300000.00';
const apiError = (status: number, body: Record<string, unknown>) =>
  new ApiError(status, { maLoi: 'X', thongBao: 'x', ...body });

describe('policy-form (payment F5)', () => {
  it('WCP-01 dữ liệu máy chủ ⇒ ô nhập: cọc bỏ ".00", mốc giữ thứ tự; bảng mẫu đúng Figma 553:2', () => {
    const result = draftFromPolicy({
      dichVuKhamId: '7',
      mucDatCoc: '100000.00',
      moc: [
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ],
    });
    expect(result.deposit).toBe('100000');
    expect(result.tiers.map((t) => [t.hours, t.rate])).toEqual([
      ['24', '100'],
      ['0', '0'],
    ]);
    expect(DEFAULT_TIERS).toEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
      { soGioTruocToiThieu: 0, tyLeHoan: 0 },
    ]);
    expect(templateTiers().map((t) => [t.hours, t.rate])).toEqual([
      ['24', '100'],
      ['2', '50'],
      ['0', '0'],
    ]);
    // Khoá React khác nhau giữa các mốc mới
    expect(emptyTier().key).not.toBe(emptyTier().key);
    expect(depositInput('0.00')).toBe('0');
  });

  it('WCP-02 thân PUT: cọc là CHUỖI số nguyên đồng, mốc là số; mảng rỗng gửi được', () => {
    expect(
      buildInput(
        draft(' 50000 ', [
          ['24', '100'],
          ['2', '50'],
        ]),
        PRICE,
      ),
    ).toEqual({
      errors: {},
      input: {
        mucDatCoc: '50000',
        moc: [
          { soGioTruocToiThieu: 24, tyLeHoan: 100 },
          { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        ],
      },
    });
    expect(buildInput(draft('0', []), PRICE).input).toEqual({
      mucDatCoc: '0',
      moc: [],
    });
  });

  it('WCP-03 định dạng sai không gửi: lỗi gắn đúng ô (cọc, giờ, tỷ lệ của từng mốc); tỷ lệ 0 và 100 hợp lệ (biên)', () => {
    const result = buildInput(
      draft('abc', [
        ['', '101'],
        ['1.5', '-1'],
        ['3', '100'],
        ['0', '0'],
      ]),
      PRICE,
    );
    expect(result.input).toBeNull();
    expect(Object.keys(result.errors).sort()).toEqual([
      'deposit',
      'tier.0.hours',
      'tier.0.rate',
      'tier.1.hours',
      'tier.1.rate',
    ]);
    // Cọc âm, số 0 đứng đầu, phần lẻ: đều là định dạng sai ở web
    for (const bad of ['-1', '0100', '100.5', '']) {
      expect(buildInput(draft(bad, []), PRICE).errors.deposit).toBeDefined();
    }
  });

  it('WCP-03 quá số mốc tối đa ⇒ lỗi chung của bảng mốc', () => {
    const tiers = Array.from(
      { length: MAX_TIERS + 1 },
      (_, i) => [String(100 - i), '10'] as [string, string],
    );
    expect(buildInput(draft('0', tiers), PRICE).errors.tiers).toBe(
      'Tối đa 6 mốc.',
    );
  });

  it('WCP-06 ★ cọc so với giá bằng BigInt trên CHUỖI: vượt giá bị chặn, bằng giá được (biên); số lớn hơn 2^53 vẫn so đúng (qua `Number` sẽ sai)', () => {
    expect(buildInput(draft('300001', []), PRICE).errors.deposit).toBe(
      'Mức đặt cọc không được lớn hơn giá dịch vụ.',
    );
    expect(buildInput(draft('300000', []), PRICE).errors).toEqual({});
    expect(depositExceedsPrice('300000', '299999.99')).toBe(true);
    expect(depositExceedsPrice('9007199254740993', '9007199254740992.99')).toBe(
      true,
    );
    expect(depositExceedsPrice('9007199254740992', '9007199254740993.00')).toBe(
      false,
    );
    expect(isZeroAmount('0.00')).toBe(true);
    expect(isZeroAmount('0.01')).toBe(false);
  });

  it('WCP-04 cảnh báo khi có cọc mà không có mốc; cọc 0 hay có mốc thì không', () => {
    expect(noRefundWarning(draft('100000', []))).toBe(true);
    expect(noRefundWarning(draft('0', []))).toBe(false);
    expect(noRefundWarning(draft('100000', [['24', '100']]))).toBe(false);
    expect(noRefundWarning(draft('abc', []))).toBe(false);
  });

  it('WCP-03 lỗi máy chủ theo `loi[].ma` gắn đúng ô cho CẢ HAI dạng tên trường (luật B10 `moc[1]` và ValidationPipe `moc.1`), không banner khi đã gắn được ô', () => {
    const feedback = saveFeedbackFor(
      apiError(400, {
        maLoi: 'CHINH_SACH_COC_KHONG_HOP_LE',
        loi: [
          { truong: 'mucDatCoc', ma: 'MUC_COC_VUOT_GIA' },
          { truong: 'moc[1].tyLeHoan', ma: 'TY_LE_MOC_TANG' },
          { truong: 'moc.0.soGioTruocToiThieu', ma: 'SO_GIO_MOC_KHONG_HOP_LE' },
          { truong: 'moc', ma: 'QUA_NHIEU_MOC' },
        ],
      }),
    );
    expect(feedback).toEqual({
      message: '',
      fields: {
        deposit: 'Mức đặt cọc không được lớn hơn giá dịch vụ.',
        'tier.1.rate':
          'Hủy càng sát giờ hẹn thì tỷ lệ hoàn không được cao hơn mốc xa hơn.',
        'tier.0.hours': 'Số giờ phải là số nguyên không âm.',
        tiers: 'Tối đa 6 mốc.',
      },
    });
  });

  it('WCP-07 lỗi không gắn được ô ⇒ banner: 404, 403, lỗi lạ, mất mạng', () => {
    expect(
      saveFeedbackFor(apiError(404, { maLoi: 'KHONG_TIM_THAY' })).message,
    ).toBe('Dịch vụ không còn tồn tại. Hãy tải lại danh sách.');
    expect(
      saveFeedbackFor(apiError(403, { maLoi: 'KHONG_DU_QUYEN' })).message,
    ).toBe('Bạn không có quyền thực hiện thao tác này.');
    expect(
      saveFeedbackFor(apiError(500, { maLoi: 'LOI_HE_THONG' })).message,
    ).toBe('Không lưu được chính sách. Vui lòng thử lại.');
    expect(saveFeedbackFor(new NetworkError()).message).toBe(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    // Mã lạ trong `loi[]` không gắn được ô ⇒ vẫn có banner, không im lặng
    expect(
      saveFeedbackFor(apiError(400, { loi: [{ truong: 'khac', ma: 'MA_LA' }] }))
        .message,
    ).not.toBe('');
  });
});

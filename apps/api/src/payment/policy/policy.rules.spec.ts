import {
  MAX_REFUND_TIERS,
  POLICY_ERROR_CODES,
  sortTiersDescending,
  validatePolicy,
  type DepositPolicyInput,
} from './policy.rules.js';

// payment B10: luật hợp lệ chính sách cọc (hàm thuần). Mã test case theo PLAN payment 7.1. Dữ liệu giả.
const PRICE = '300000.00';
const GOOD_TIERS = [
  { soGioTruocToiThieu: 24, tyLeHoan: 100 },
  { soGioTruocToiThieu: 2, tyLeHoan: 50 },
  { soGioTruocToiThieu: 0, tyLeHoan: 0 },
];
const policy = (
  patch: Partial<DepositPolicyInput> = {},
): DepositPolicyInput => ({
  mucDatCoc: '100000',
  moc: GOOD_TIERS,
  ...patch,
});
const codes = (input: DepositPolicyInput, price = PRICE) =>
  validatePolicy(input, price);

describe('policy.rules (payment B10)', () => {
  it('CSD-02 chính sách mẫu của Figma (cọc 100.000; 24 ⇒ 100, 2 ⇒ 50, 0 ⇒ 0) hợp lệ', () => {
    expect(codes(policy())).toEqual([]);
  });

  it('CSD-03 cọc âm ⇒ MUC_COC_AM; cọc 0 hợp lệ (biên: không đặt cọc)', () => {
    expect(codes(policy({ mucDatCoc: '-1' }))).toEqual([
      { truong: 'mucDatCoc', ma: POLICY_ERROR_CODES.DEPOSIT_NEGATIVE },
    ]);
    expect(codes(policy({ mucDatCoc: '0' }))).toEqual([]);
  });

  it('CSD-04 cọc vượt giá ⇒ MUC_COC_VUOT_GIA; đúng bằng giá hợp lệ (biên); so theo giá trị không so chuỗi', () => {
    expect(codes(policy({ mucDatCoc: '300001' }))).toEqual([
      { truong: 'mucDatCoc', ma: POLICY_ERROR_CODES.DEPOSIT_OVER_PRICE },
    ]);
    expect(codes(policy({ mucDatCoc: '300000' }))).toEqual([]);
    // "99999" nhỏ hơn "300000" theo giá trị dù lớn hơn theo thứ tự chữ; giá có phần lẻ vẫn so đúng
    expect(codes(policy({ mucDatCoc: '99999' }))).toEqual([]);
    expect(codes(policy({ mucDatCoc: '300000' }), '299999.99')).toEqual([
      { truong: 'mucDatCoc', ma: POLICY_ERROR_CODES.DEPOSIT_OVER_PRICE },
    ]);
  });

  it('CSD-05 tỷ lệ −1 và 101 ⇒ TY_LE_HOAN_NGOAI_KHOANG; 0 và 100 hợp lệ (biên); số lẻ cũng bị từ chối', () => {
    for (const bad of [-1, 101, 50.5]) {
      expect(
        codes(policy({ moc: [{ soGioTruocToiThieu: 5, tyLeHoan: bad }] })),
      ).toEqual([
        {
          truong: 'moc[0].tyLeHoan',
          ma: POLICY_ERROR_CODES.RATE_OUT_OF_RANGE,
        },
      ]);
    }
    expect(
      codes(
        policy({
          moc: [
            { soGioTruocToiThieu: 5, tyLeHoan: 100 },
            { soGioTruocToiThieu: 1, tyLeHoan: 0 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('CSD-06 giờ trùng ⇒ MOC_TRUNG_SO_GIO (báo ở mốc đứng sau); giờ âm, không nguyên, quá lớn ⇒ SO_GIO_MOC_KHONG_HOP_LE; giờ 0 hợp lệ (biên)', () => {
    expect(
      codes(
        policy({
          moc: [
            { soGioTruocToiThieu: 24, tyLeHoan: 100 },
            { soGioTruocToiThieu: 24, tyLeHoan: 50 },
          ],
        }),
      ),
    ).toEqual([
      {
        truong: 'moc[1].soGioTruocToiThieu',
        ma: POLICY_ERROR_CODES.HOURS_DUPLICATE,
      },
    ]);
    for (const bad of [-1, 1.5, 2147483648]) {
      expect(
        codes(policy({ moc: [{ soGioTruocToiThieu: bad, tyLeHoan: 10 }] })),
      ).toEqual([
        {
          truong: 'moc[0].soGioTruocToiThieu',
          ma: POLICY_ERROR_CODES.HOURS_INVALID,
        },
      ]);
    }
    expect(
      codes(policy({ moc: [{ soGioTruocToiThieu: 0, tyLeHoan: 0 }] })),
    ).toEqual([]);
  });

  it('CSD-07 tỷ lệ tăng khi số giờ giảm (24 ⇒ 50, 2 ⇒ 100) ⇒ TY_LE_MOC_TANG ở mốc làm tăng; không phụ thuộc thứ tự gửi lên; bằng nhau hợp lệ (biên)', () => {
    const rising = [
      { soGioTruocToiThieu: 24, tyLeHoan: 50 },
      { soGioTruocToiThieu: 2, tyLeHoan: 100 },
    ];
    expect(codes(policy({ moc: rising }))).toEqual([
      { truong: 'moc[1].tyLeHoan', ma: POLICY_ERROR_CODES.RATE_INCREASES },
    ]);
    // Gửi ngược thứ tự vẫn cùng lỗi, trỏ đúng mốc (chỉ số trong mảng GỬI LÊN)
    expect(codes(policy({ moc: [...rising].reverse() }))).toEqual([
      { truong: 'moc[0].tyLeHoan', ma: POLICY_ERROR_CODES.RATE_INCREASES },
    ]);
    expect(
      codes(
        policy({
          moc: [
            { soGioTruocToiThieu: 24, tyLeHoan: 50 },
            { soGioTruocToiThieu: 2, tyLeHoan: 50 },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('CSD-08 bảy mốc ⇒ QUA_NHIEU_MOC; sáu mốc hợp lệ (biên)', () => {
    const tiers = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        soGioTruocToiThieu: 100 - i,
        tyLeHoan: 100 - i,
      }));
    expect(MAX_REFUND_TIERS).toBe(6);
    expect(codes(policy({ moc: tiers(6) }))).toEqual([]);
    expect(codes(policy({ moc: tiers(7) }))).toEqual([
      { truong: 'moc', ma: POLICY_ERROR_CODES.TOO_MANY_TIERS },
    ]);
  });

  it('CSD-13 cọc > 0 mà không có mốc nào hợp lệ (mảng rỗng = không hoàn); cọc 0 kèm mốc cũng hợp lệ', () => {
    expect(codes(policy({ moc: [] }))).toEqual([]);
    expect(codes(policy({ mucDatCoc: '0', moc: GOOD_TIERS }))).toEqual([]);
  });

  it('CSD-09 nhiều lỗi cùng lúc ⇒ liệt kê ĐỦ, không dừng ở lỗi đầu, không mang giá trị gửi lên', () => {
    const errors = codes(
      policy({
        mucDatCoc: '-5',
        moc: [
          { soGioTruocToiThieu: 24, tyLeHoan: 101 },
          { soGioTruocToiThieu: 24, tyLeHoan: 50 },
          { soGioTruocToiThieu: -1, tyLeHoan: 0 },
        ],
      }),
    );
    expect(errors).toEqual([
      { truong: 'mucDatCoc', ma: 'MUC_COC_AM' },
      { truong: 'moc[0].tyLeHoan', ma: 'TY_LE_HOAN_NGOAI_KHOANG' },
      { truong: 'moc[1].soGioTruocToiThieu', ma: 'MOC_TRUNG_SO_GIO' },
      { truong: 'moc[2].soGioTruocToiThieu', ma: 'SO_GIO_MOC_KHONG_HOP_LE' },
    ]);
    const text = JSON.stringify(errors);
    for (const typed of ['-5', '101', '-1']) expect(text).not.toContain(typed);
  });

  it('sortTiersDescending xếp giờ giảm dần, không sửa mảng gốc', () => {
    const original = [
      { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ];
    expect(
      sortTiersDescending(original, (tier) => tier).map(
        (tier) => tier.soGioTruocToiThieu,
      ),
    ).toEqual([24, 2, 0]);
    expect(original[0]!.soGioTruocToiThieu).toBe(0);
  });
});

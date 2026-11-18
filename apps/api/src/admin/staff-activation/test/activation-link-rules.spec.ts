import {
  decideResend,
  deriveActivationLinkState,
  type ResendPolicy,
} from '../activation-link-rules.js';

// Task B14 (admin) — quy tắc thuần của liên kết kích hoạt: bảng trạng thái PLAN 5.5 (NS-37, NS-32 mức hàm) và giới hạn gửi lại Q23
// (NS-45, TK-47). Không DB, không đồng hồ thật. Mã NSB14-nn là [đề xuất].
const NOW = new Date('2026-11-18T03:00:00.000Z');
const at = (offsetSeconds: number): Date =>
  new Date(NOW.getTime() + offsetSeconds * 1000);
const ago = (seconds: number): Date => at(-seconds);

describe('deriveActivationLinkState', () => {
  const row = (
    overrides: Partial<{
      daDungLuc: Date | null;
      daGuiLuc: Date | null;
      thuHoiLuc: Date | null;
      hetHanLuc: Date;
    }> = {},
  ) => ({
    daDungLuc: null,
    daGuiLuc: null,
    thuHoiLuc: null,
    hetHanLuc: at(3600),
    ...overrides,
  });

  it.each([
    ['mới tạo: da_gui_luc rỗng, thu_hoi_luc rỗng', row(), 'MOI_TAO'],
    [
      'hợp lệ: đã gửi, chưa thu hồi, chưa dùng, còn hạn',
      row({ daGuiLuc: ago(60) }),
      'HOP_LE',
    ],
    [
      'gửi lỗi: thu hồi khi chưa gửi',
      row({ thuHoiLuc: ago(10) }),
      'BI_THU_HOI',
    ],
    [
      'bị thay: đã gửi rồi bị thu hồi',
      row({ daGuiLuc: ago(100), thuHoiLuc: ago(10) }),
      'BI_THU_HOI',
    ],
    ['đã dùng', row({ daGuiLuc: ago(100), daDungLuc: ago(10) }), 'DA_DUNG'],
  ])('NSB14-05 (NS-37) %s', (_name, input, expected) => {
    expect(deriveActivationLinkState(input, NOW)).toBe(expected);
  });

  it.each([
    ['het_han_luc − 1 giây', ago(1), 'HET_HAN'],
    ['het_han_luc = bây giờ (nửa mở: đã hết)', NOW, 'HET_HAN'],
    ['het_han_luc + 1 giây', at(1), 'HOP_LE'],
  ])('NSB14-05 (NS-32) biên hạn: %s', (_name, hetHanLuc, expected) => {
    expect(
      deriveActivationLinkState(row({ daGuiLuc: ago(60), hetHanLuc }), NOW),
    ).toBe(expected);
  });

  it('NSB14-05 thứ tự ưu tiên: đã dùng > thu hồi > mới tạo > hết hạn', () => {
    const expired = ago(5);
    expect(
      deriveActivationLinkState(
        row({ daGuiLuc: ago(100), daDungLuc: ago(10), hetHanLuc: expired }),
        NOW,
      ),
    ).toBe('DA_DUNG');
    expect(
      deriveActivationLinkState(
        row({ daGuiLuc: ago(100), thuHoiLuc: ago(10), hetHanLuc: expired }),
        NOW,
      ),
    ).toBe('BI_THU_HOI');
    // Chưa gửi mà đã quá hạn: vẫn là "mới tạo" (không có hiệu lực), không phải "hết hạn"
    expect(deriveActivationLinkState(row({ hetHanLuc: expired }), NOW)).toBe(
      'MOI_TAO',
    );
  });
});

describe('decideResend', () => {
  // Giá trị mặc định của biến môi trường (Q23): 60 giây, 5 hàng mỗi giờ
  const DEFAULT: ResendPolicy = {
    minIntervalMs: 60_000,
    maxPerWindow: 5,
    windowMs: 3_600_000,
  };

  it('NSB14-06 (NS-45) chưa có hàng nào ⇒ được', () => {
    expect(decideResend([], NOW, DEFAULT)).toEqual({ allowed: true });
  });

  it.each([
    [1, false, 59],
    [30, false, 30],
    [59, false, 1],
    [60, true, 0],
    [61, true, 0],
  ])(
    'NSB14-06 (NS-45) hàng mới nhất cách %i giây ⇒ được = %s (chờ %i giây)',
    (seconds, allowed, wait) => {
      const decision = decideResend([ago(seconds)], NOW, DEFAULT);
      expect(decision.allowed).toBe(allowed);
      if (!decision.allowed) {
        expect(decision.reason).toBe('TOO_SOON');
        expect(decision.retryAfterSeconds).toBe(wait);
      }
    },
  );

  it('NSB14-06 (TK-47) 4 hàng trong cửa sổ ⇒ hàng thứ 5 được; 5 hàng ⇒ hàng thứ 6 bị từ chối kèm số giây chờ đúng', () => {
    const four = [ago(61), ago(122), ago(183), ago(244)];
    expect(decideResend(four, NOW, DEFAULT)).toEqual({ allowed: true });

    const five = [...four, ago(305)];
    // Hàng cũ nhất (305 giây tuổi) phải rời cửa sổ 1 giờ: còn 3600 − 305 giây
    expect(decideResend(five, NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 3295,
    });
  });

  it('NSB14-06 cửa sổ nửa mở: hàng đúng 3600 giây tuổi KHÔNG còn được đếm, 3599 giây thì còn', () => {
    const recent = [ago(61), ago(122), ago(183), ago(244)];
    expect(decideResend([...recent, ago(3600)], NOW, DEFAULT)).toEqual({
      allowed: true,
    });
    expect(decideResend([...recent, ago(3599)], NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 1,
    });
  });

  it('NSB14-06 đầu vào không sắp xếp vẫn ra cùng kết quả (hàm tự sắp theo thời gian)', () => {
    const shuffled = [ago(305), ago(61), ago(244), ago(122), ago(183)];
    expect(decideResend(shuffled, NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 3295,
    });
    expect(decideResend([ago(3000), ago(10)], NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 50,
    });
  });

  it('NSB14-06 vi phạm cả hai ⇒ trả thời gian chờ LỚN hơn; hòa thì TOO_SOON', () => {
    // 5 hàng mà hàng mới nhất cách 10 giây: chờ khoảng cách 50 giây, chờ cửa sổ 3350 giây ⇒ HOURLY_LIMIT với 3350
    const both = [ago(10), ago(70), ago(130), ago(190), ago(250)];
    expect(decideResend(both, NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 3350,
    });
    // Hai thời gian chờ bằng nhau (60 giây): TOO_SOON
    const tie: ResendPolicy = {
      minIntervalMs: 60_000,
      maxPerWindow: 1,
      windowMs: 60_000,
    };
    expect(decideResend([NOW], NOW, tie)).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 60,
    });
  });

  it('NSB14-06 làm tròn LÊN giây: còn 400 mili giây thì báo chờ 1 giây (không phải 0)', () => {
    const createdAt = new Date(NOW.getTime() - 59_600);
    expect(decideResend([createdAt], NOW, DEFAULT)).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 1,
    });
  });

  it('NSB14-06 giá trị cấu hình KHÁC mặc định (10 giây, 2 hàng mỗi giờ) được theo đúng', () => {
    const custom: ResendPolicy = {
      minIntervalMs: 10_000,
      maxPerWindow: 2,
      windowMs: 3_600_000,
    };
    expect(decideResend([ago(10)], NOW, custom)).toEqual({ allowed: true });
    expect(decideResend([ago(9)], NOW, custom)).toEqual({
      allowed: false,
      reason: 'TOO_SOON',
      retryAfterSeconds: 1,
    });
    // 2 hàng trong giờ ⇒ hàng thứ 3 bị từ chối; hàng cũ nhất (20 giây tuổi) cần 3580 giây nữa mới rời cửa sổ
    expect(decideResend([ago(20), ago(10)], NOW, custom)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 3580,
    });
    // Mặc định (5 hàng, 60 giây): hai hàng cách đủ 60 giây thì hàng kế tiếp được, trong khi bộ "2 hàng mỗi giờ" ở trên đã từ chối
    expect(decideResend([ago(130), ago(70)], NOW, DEFAULT)).toEqual({
      allowed: true,
    });
    expect(decideResend([ago(130), ago(70)], NOW, custom)).toEqual({
      allowed: false,
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 3470,
    });
  });
});

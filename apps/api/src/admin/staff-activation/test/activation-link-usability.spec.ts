import * as nodeCrypto from 'node:crypto';
import { vi } from 'vitest';
import {
  isActivationLinkUsable,
  type AccountFacts,
  type LinkFacts,
} from '../activation-link-usability.js';
import {
  generateActivationToken,
  hashActivationToken,
} from '../activation-link-token.js';

// Task B16 (admin) — hàm thuần "liên kết kích hoạt có dùng được không" (PLAN admin 5.5; NS-32, 33, 35, 36, 37, 41). Mã NSB16-nn là [đề xuất].
// Bọc timingSafeEqual bằng spy (vẫn chạy hàm thật) để đếm: MỌI nhánh làm đúng MỘT lần so khớp hằng định (không ngắn mạch).
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const NOW = new Date('2026-11-18T03:00:00.000Z');
const SECOND = 1000;
const HOUR = 3_600_000;

const rawLinkValue = generateActivationToken();
const storedHash = hashActivationToken(rawLinkValue);

const goodLink = (over: Partial<LinkFacts> = {}): LinkFacts => ({
  maBam: storedHash,
  hetHanLuc: new Date(NOW.getTime() + HOUR),
  daGuiLuc: new Date(NOW.getTime() - HOUR),
  thuHoiLuc: null,
  daDungLuc: null,
  ...over,
});
const goodAccount = (over: Partial<AccountFacts> = {}): AccountFacts => ({
  trangThai: 'ChoKichHoat',
  loaiTaiKhoan: 'LeTan',
  ...over,
});

describe('isActivationLinkUsable: chỉ đúng khi ĐỦ ba điều kiện', () => {
  it('NSB16-01 (NS-30) liên kết hợp lệ, tài khoản ChoKichHoat, token khớp ⇒ true (cả ba vai trò nhân sự)', () => {
    for (const loai of ['BacSi', 'LeTan', 'QuanTriVien'] as const) {
      expect(
        isActivationLinkUsable(
          goodLink(),
          goodAccount({ loaiTaiKhoan: loai }),
          rawLinkValue,
          NOW,
        ),
        loai,
      ).toBe(true);
    }
  });

  it('NSB16-01 (NS-33, 37) mỗi trạng thái liên kết KHÔNG dùng được ⇒ false: đã dùng, thu hồi, mới tạo (chưa gửi), hết hạn', () => {
    const past = new Date(NOW.getTime() - SECOND);
    const cases: [string, Partial<LinkFacts>][] = [
      ['đã dùng', { daDungLuc: past }],
      ['thu hồi (gửi lỗi hoặc bị thay)', { thuHoiLuc: past }],
      ['mới tạo (chưa gửi)', { daGuiLuc: null }],
      ['hết hạn', { hetHanLuc: new Date(NOW.getTime() - SECOND) }],
    ];
    for (const [label, over] of cases) {
      expect(
        isActivationLinkUsable(
          goodLink(over),
          goodAccount(),
          rawLinkValue,
          NOW,
        ),
        label,
      ).toBe(false);
    }
  });

  it('NSB16-01 (NS-32) biên hạn nửa mở: còn 1 giây ⇒ true; đúng hạn ⇒ false; quá 1 giây ⇒ false', () => {
    const expiresAt = (offsetMs: number): LinkFacts =>
      goodLink({ hetHanLuc: new Date(NOW.getTime() + offsetMs) });
    const run = (link: LinkFacts): boolean =>
      isActivationLinkUsable(link, goodAccount(), rawLinkValue, NOW);
    expect(run(expiresAt(SECOND))).toBe(true);
    expect(run(expiresAt(0))).toBe(false);
    expect(run(expiresAt(-SECOND))).toBe(false);
  });

  it('NSB16-01 (NS-36) tài khoản KHÔNG ChoKichHoat (DangHoatDong, NgungHoatDong) hoặc là Bệnh nhân ⇒ false dù liên kết hợp lệ', () => {
    for (const account of [
      goodAccount({ trangThai: 'DangHoatDong' }),
      goodAccount({ trangThai: 'NgungHoatDong' }),
      goodAccount({ loaiTaiKhoan: 'BenhNhan' }),
    ]) {
      expect(
        isActivationLinkUsable(goodLink(), account, rawLinkValue, NOW),
        `${account.trangThai} ${account.loaiTaiKhoan}`,
      ).toBe(false);
    }
  });

  it('NSB16-01 (NS-35) token sai một ký tự, token của liên kết khác, null, sai dạng ⇒ false; không có hàng hoặc không có tài khoản ⇒ false', () => {
    const flipped = `${rawLinkValue.slice(0, -1)}${rawLinkValue.endsWith('A') ? 'B' : 'A'}`;
    const wrong = [
      flipped,
      generateActivationToken(),
      null,
      '',
      rawLinkValue.slice(1),
      `${rawLinkValue}A`,
      `${rawLinkValue}\n`,
    ];
    for (const presented of wrong) {
      expect(
        isActivationLinkUsable(goodLink(), goodAccount(), presented, NOW),
        String(presented).length.toString(),
      ).toBe(false);
    }
    expect(isActivationLinkUsable(null, null, rawLinkValue, NOW)).toBe(false);
    expect(isActivationLinkUsable(goodLink(), null, rawLinkValue, NOW)).toBe(
      false,
    );
    expect(isActivationLinkUsable(null, goodAccount(), rawLinkValue, NOW)).toBe(
      false,
    );
  });

  it('NSB16-01 mỗi điều kiện sai MỘT MÌNH đều đủ làm kết quả false (không điều kiện nào bị che bởi điều kiện khác)', () => {
    const singleFailures: [string, LinkFacts, AccountFacts, string | null][] = [
      [
        'chỉ liên kết đã dùng',
        goodLink({ daDungLuc: new Date(NOW.getTime() - SECOND) }),
        goodAccount(),
        rawLinkValue,
      ],
      [
        'chỉ tài khoản đã hoạt động',
        goodLink(),
        goodAccount({ trangThai: 'DangHoatDong' }),
        rawLinkValue,
      ],
      ['chỉ token sai', goodLink(), goodAccount(), generateActivationToken()],
    ];
    for (const [label, link, account, presented] of singleFailures) {
      expect(isActivationLinkUsable(link, account, presented, NOW), label).toBe(
        false,
      );
    }
  });
});

describe('isActivationLinkUsable: không ngắn mạch (NS-35, NS-41)', () => {
  it('NSB16-02 (NS-35, NS-41) MỌI nhánh thất bại và nhánh thành công gọi timingSafeEqual ĐÚNG MỘT lần, với hai buffer 32 byte', () => {
    const past = new Date(NOW.getTime() - SECOND);
    const branches: [
      string,
      LinkFacts | null,
      AccountFacts | null,
      string | null,
    ][] = [
      ['thành công', goodLink(), goodAccount(), rawLinkValue],
      ['không có hàng', null, null, rawLinkValue],
      ['token sai dạng', goodLink(), goodAccount(), 'khong-dung-dang'],
      ['token null', goodLink(), goodAccount(), null],
      [
        'token sai (đúng dạng)',
        goodLink(),
        goodAccount(),
        generateActivationToken(),
      ],
      ['đã dùng', goodLink({ daDungLuc: past }), goodAccount(), rawLinkValue],
      ['thu hồi', goodLink({ thuHoiLuc: past }), goodAccount(), rawLinkValue],
      ['chưa gửi', goodLink({ daGuiLuc: null }), goodAccount(), rawLinkValue],
      ['hết hạn', goodLink({ hetHanLuc: past }), goodAccount(), rawLinkValue],
      [
        'tài khoản không chờ',
        goodLink(),
        goodAccount({ trangThai: 'NgungHoatDong' }),
        rawLinkValue,
      ],
    ];
    for (const [label, link, account, presented] of branches) {
      vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
      isActivationLinkUsable(link, account, presented, NOW);
      expect(nodeCrypto.timingSafeEqual, label).toHaveBeenCalledTimes(1);
      const [left, right] = vi.mocked(nodeCrypto.timingSafeEqual).mock
        .calls[0] ?? [new Uint8Array(0), new Uint8Array(0)];
      expect(left.byteLength, label).toBe(32);
      expect(right.byteLength, label).toBe(32);
    }
  });

  it('NSB16-02 (M-eq) token sai dạng thay bằng token mốc không bao giờ khớp băm của một token ngẫu nhiên (1000 lần)', () => {
    for (let i = 0; i < 1000; i++) {
      const randomHash = hashActivationToken(generateActivationToken());
      expect(
        isActivationLinkUsable(
          goodLink({ maBam: randomHash }),
          goodAccount(),
          'sai-dang',
          NOW,
        ),
      ).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  readReturnTo,
  returnPathFor,
  returnToStateFor,
  safeReturnPath,
  withReturnTo,
} from './return-to';
import { ROLE_HOME_PATHS, type VaiTro } from './roles';

// booking F3 (`[ĐỤNG auth]`, Q39, M10). Mã ca BRT-01…BRT-05 là [đề xuất] (PLAN booking mục 7.27 sau khi duyệt).
const BOOKING_URL = '/dat-lich/thong-tin?khungGioId=5';

describe('booking F3 — safeReturnPath và returnPathFor', () => {
  it('BRT-01 nhận đường dẫn nội bộ đúng nguyên văn (kể cả query và hash) và đúng gốc /dat-lich', () => {
    expect(safeReturnPath(BOOKING_URL)).toBe(BOOKING_URL);
    expect(safeReturnPath('/dat-lich/thong-tin?khungGioId=5#x')).toBe(
      '/dat-lich/thong-tin?khungGioId=5#x',
    );
    expect(safeReturnPath('/dat-lich')).toBe('/dat-lich');
    expect(safeReturnPath('/')).toBe('/');
  });

  it('BRT-02 loại mọi dạng mở chuyển hướng ra ngoài', () => {
    const hostile = [
      '//evil.com',
      '//evil.com/dat-lich',
      '/\\evil.com',
      'https://evil.com',
      'http://evil.com/dat-lich',
      'javascript:alert(1)',
      'data:text/html,<p>x</p>',
      'dat-lich/thong-tin',
      '',
    ];
    for (const raw of hostile) expect(safeReturnPath(raw)).toBeNull();
  });

  it('BRT-03 loại ký tự điều khiển, khoảng trắng, dấu \\ giữa chuỗi, chuỗi quá dài và giá trị không phải chuỗi', () => {
    // Trình duyệt bỏ tab, xuống dòng khi phân tích URL: `/<tab>/evil.com` sẽ thành `//evil.com`
    const withControl = [
      '/\t/evil.com',
      '/\n/evil.com',
      '/\r/evil.com',
      '/dat-lich\u0000',
      '/dat-lich/thong tin',
      '/dat-lich\u007f',
      '/dat-lich/a\\b',
    ];
    for (const raw of withControl) expect(safeReturnPath(raw)).toBeNull();
    // Ca biên của độ dài: đúng 2048 ký tự còn nhận, 2049 thì loại
    const edge = `/dat-lich/${'a'.repeat(2048 - '/dat-lich/'.length)}`;
    expect(edge).toHaveLength(2048);
    expect(safeReturnPath(edge)).toBe(edge);
    expect(safeReturnPath(`${edge}a`)).toBeNull();
    for (const raw of [undefined, null, 5, true, {}, ['/dat-lich']]) {
      expect(safeReturnPath(raw)).toBeNull();
    }
  });

  it('BRT-04 trả đường dẫn đã chuẩn hoá nên `..` không lọt qua kiểm vai; ranh giới /dat-lich', () => {
    // `new URL` chuẩn hoá dấu chấm kép, kể cả dạng mã hoá phần trăm
    expect(safeReturnPath('/dat-lich/../admin')).toBe('/admin');
    expect(safeReturnPath('/dat-lich/%2e%2e/admin')).toBe('/admin');
    expect(returnPathFor('BenhNhan', { from: '/dat-lich/../admin' })).toBe(
      ROLE_HOME_PATHS.BenhNhan,
    );
    expect(returnPathFor('BenhNhan', { from: '/dat-lich/%2e%2e/admin' })).toBe(
      ROLE_HOME_PATHS.BenhNhan,
    );
    // `/dat-lichxyz` bắt đầu bằng `/dat-lich` nhưng không phải đường dẫn con của nó
    expect(returnPathFor('BenhNhan', { from: '/dat-lichxyz' })).toBe(
      ROLE_HOME_PATHS.BenhNhan,
    );
    expect(returnPathFor('BenhNhan', { from: '/dat-lich?x=1' })).toBe(
      '/dat-lich?x=1',
    );
  });

  // Mở rộng BRT-04 (sau phiên kiểm giai đoạn 1): dấu chấm kép làm chuỗi THÔ qua kiểm "ký tự thứ hai không phải /" nhưng chuẩn hoá
  // thành `//evil.com` (protocol-relative). Kết quả chuẩn hoá phải bị kiểm LẠI bằng cùng luật cấu trúc.
  it('BRT-04 chuẩn hoá ra `//` (protocol-relative) thì loại: `/..//evil.com`, `/.//evil.com`, `/dat-lich/..//evil.com`, `/dat-lich/%2e%2e//evil.com`', () => {
    const hostile = [
      '/..//evil.com',
      '/.//evil.com',
      '/dat-lich/..//evil.com',
      '/dat-lich/%2e%2e//evil.com',
      '/dat-lich/%2E%2E//evil.com',
      '/dat-lich/./..//evil.com',
    ];
    for (const raw of hostile) {
      expect(safeReturnPath(raw)).toBeNull();
      expect(readReturnTo({ from: raw })).toBeNull();
      expect(returnPathFor('BenhNhan', { from: raw })).toBe(
        ROLE_HOME_PATHS.BenhNhan,
      );
    }
    // Đối chứng: dấu chấm kép chuẩn hoá ra đường dẫn thường (một `/`) vẫn nhận
    expect(safeReturnPath('/dat-lich/../dat-lich/x')).toBe('/dat-lich/x');
  });

  it('BRT-05 returnPathFor: Bệnh nhân + from hợp lệ ⇒ from; vai khác, from ngoài /dat-lich hay không có from ⇒ trang chủ của vai', () => {
    expect(returnPathFor('BenhNhan', { from: BOOKING_URL })).toBe(BOOKING_URL);
    // Ba vai còn lại có from hợp lệ vẫn về trang chủ của vai
    for (const vaiTro of ['BacSi', 'LeTan', 'QuanTriVien'] as VaiTro[]) {
      expect(returnPathFor(vaiTro, { from: BOOKING_URL })).toBe(
        ROLE_HOME_PATHS[vaiTro],
      );
    }
    // from hợp lệ nhưng không thuộc luồng đặt lịch ⇒ không dùng (giữ hành vi cũ)
    expect(returnPathFor('BenhNhan', { from: '/admin' })).toBe(
      ROLE_HOME_PATHS.BenhNhan,
    );
    // Đối chứng hành vi cũ: không có from, state lạ
    for (const state of [undefined, null, {}, { email: 'a@b.vn' }, 'x', 5]) {
      for (const vaiTro of Object.keys(ROLE_HOME_PATHS) as VaiTro[]) {
        expect(returnPathFor(vaiTro, state)).toBe(ROLE_HOME_PATHS[vaiTro]);
      }
    }
    // from thù địch đặt thẳng vào state
    expect(returnPathFor('BenhNhan', { from: '//evil.com' })).toBe(
      ROLE_HOME_PATHS.BenhNhan,
    );
  });
});

// Bộ sinh số ngẫu nhiên có hạt giống cố định (mulberry32): cùng hạt thì cùng dãy, nên ca này lặp lại được và không flaky
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasForbiddenChar(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || char === '\\') return true;
  }
  return false;
}

describe('booking F3 — thuộc tính của safeReturnPath', () => {
  // Bộ ký tự thù địch cho đường dẫn: dấu gạch, chấm, phần trăm, mã hoá của chúng, tab, xuống dòng, @ và :
  const TOKENS = [
    '/',
    '/',
    '/',
    '\\',
    '%',
    '.',
    '..',
    '\t',
    '\n',
    '%2e',
    '%2E',
    '%2f',
    '%5c',
    '@',
    ':',
    'a',
    'dat-lich',
    '?',
    '#',
  ];
  const ORIGIN = 'http://origin.invalid';

  it('BRT-11 20.000 chuỗi ngẫu nhiên (hạt cố định): mọi đầu ra khác null bắt đầu bằng /, không bắt đầu bằng //, cùng origin, không ký tự cấm', () => {
    const random = mulberry32(20261111);
    let accepted = 0;
    let rejected = 0;
    const violations: string[] = [];

    for (let index = 0; index < 20_000; index += 1) {
      // Nửa số chuỗi mở đầu bằng "/" cho nhiều chuỗi lọt qua kiểm thô, để kiểm tra phần chuẩn hoá
      let raw = random() < 0.5 ? '/' : '';
      const length = 1 + Math.floor(random() * 12);
      for (let t = 0; t < length; t += 1) {
        raw += TOKENS[Math.floor(random() * TOKENS.length)];
      }

      const out = safeReturnPath(raw);
      if (out === null) {
        rejected += 1;
        continue;
      }
      accepted += 1;
      const sameOrigin = new URL(out, ORIGIN).origin === ORIGIN;
      if (
        !out.startsWith('/') ||
        out.startsWith('//') ||
        !sameOrigin ||
        hasForbiddenChar(out)
      ) {
        violations.push(`${JSON.stringify(raw)} → ${JSON.stringify(out)}`);
      }
    }

    expect(violations.slice(0, 5)).toEqual([]);
    // Không rỗng nghĩa: cả hai nhánh đều được thử nhiều lần
    expect(accepted).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(1000);
  });
});

describe('booking F3 — các hàm phụ của from', () => {
  it('BRT-05 (hàm phụ) readReturnTo chỉ trả from hợp lệ; withReturnTo giữ nguyên state khi không có from', () => {
    expect(readReturnTo({ from: BOOKING_URL })).toBe(BOOKING_URL);
    expect(readReturnTo({ from: '//evil.com' })).toBeNull();
    expect(readReturnTo(undefined)).toBeNull();

    const base = { email: 'a@b.vn' };
    expect(withReturnTo(base, null)).toBe(base);
    expect(withReturnTo(undefined, null)).toBeUndefined();
    expect(withReturnTo(base, BOOKING_URL)).toEqual({
      email: 'a@b.vn',
      from: BOOKING_URL,
    });
    expect(withReturnTo(undefined, BOOKING_URL)).toEqual({ from: BOOKING_URL });
  });

  it('BRT-06 (hàm dựng state) returnToStateFor ghép pathname, search và hash; undefined nếu không hợp lệ', () => {
    expect(
      returnToStateFor({
        pathname: '/dat-lich/thong-tin',
        search: '?khungGioId=5',
        hash: '#x',
      }),
    ).toEqual({ from: '/dat-lich/thong-tin?khungGioId=5#x' });
    expect(
      returnToStateFor({ pathname: '//evil.com', search: '', hash: '' }),
    ).toBeUndefined();
  });
});

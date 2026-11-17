import { APPOINTMENT_CODE_PATTERN } from '../../appointments/appointment-code.js';
import { isValidEmail } from '../../auth/validation/email-policy.js';
import { isValidFullName } from '../../auth/validation/full-name-policy.js';
import { normalizePhone } from '../../auth/validation/phone-policy.js';
import { redactText } from '../../common/logging/sanitize.js';
import { CATALOG_BRANCHES } from './catalog-data.js';
import {
  bookerEmail,
  COMMENT_EMOJI_AT_CUT,
  COMMENT_LIKE_CHARS,
  COMMENT_LONGEST,
  COMMENT_MULTILINE,
  COMMENT_SPAM_TEXT,
  doctorEmail,
  EXAM_DEMO_CODE_PREFIX,
  EXAM_DEMO_PATIENTS,
  EXAM_DEMO_RECORDS,
  EXAM_DEMO_RELATIVES,
  EXAM_DEMO_SAMPLES,
  FOLLOW_UP_DAYS,
  HIDDEN_REASONS,
  sampleRowCount,
} from './exam-demo-data.js';
import { DEMO_DOCTORS } from './search-demo-data.js';

// EDS-14: dữ liệu mẫu của exam-demo (doctor-exam B10) đúng số lượng và hợp lệ theo chính sách của repo; không cần DB.
const ratings = EXAM_DEMO_SAMPLES.flatMap((s) => (s.rating ? [s] : []));
const hidden = ratings.filter((s) => s.rating?.hiddenReason);
const count = <T>(items: readonly T[], match: (item: T) => boolean) =>
  items.filter(match).length;

// Chi nhánh của bác sĩ theo doctorKey: 0 = dev-accounts (chi nhánh mẫu 1), 1 đến 8 = search-demo.
const branchOf = (doctorKey: number): string =>
  doctorKey === 0
    ? CATALOG_BRANCHES[0]!.ten
    : DEMO_DOCTORS.filter((d) => d.active)[doctorKey - 1]!.branch.ten;

describe('doctor-exam B10 — dữ liệu mẫu exam-demo', () => {
  it('EDS-14 có 34 lịch với mã duy nhất, liên tiếp E0001 đến E0034, đúng mẫu mã lịch hẹn và không thể trùng mã thật', () => {
    expect(EXAM_DEMO_SAMPLES).toHaveLength(34);
    const codes = EXAM_DEMO_SAMPLES.map((s) => s.code);
    expect(new Set(codes).size).toBe(34);
    expect(codes[0]).toBe('CLX-00000000-E0001');
    expect(codes[33]).toBe('CLX-00000000-E0034');
    for (const code of codes) {
      expect(code.startsWith(EXAM_DEMO_CODE_PREFIX)).toBe(true);
      expect(APPOINTMENT_CODE_PATTERN.test(code)).toBe(true);
    }
  });

  it('EDS-14 ba lịch DaTiepDon (hôm nay) và 31 lịch HoanThanh (quá khứ); đánh giá chỉ ở lịch HoanThanh', () => {
    const received = EXAM_DEMO_SAMPLES.filter((s) => s.state === 'DaTiepDon');
    expect(received).toHaveLength(3);
    expect(received.every((s) => s.daysAgo === 0 && !s.rating)).toBe(true);
    const completed = EXAM_DEMO_SAMPLES.filter((s) => s.state === 'HoanThanh');
    expect(completed).toHaveLength(31);
    expect(completed.every((s) => s.daysAgo >= 1 && s.daysAgo <= 45)).toBe(
      true,
    );
    expect(ratings.every((s) => s.state === 'HoanThanh')).toBe(true);
  });

  it('EDS-14 29 đánh giá (25 hiển thị, 4 ẩn); đủ 1 đến 5 sao theo 10, 8, 5, 3, 3; đánh giá ẩn có lý do 10 đến 255 ký tự', () => {
    expect(ratings).toHaveLength(29);
    expect(hidden).toHaveLength(4);
    const byStars = [5, 4, 3, 2, 1].map((n) =>
      count(ratings, (s) => s.rating?.stars === n),
    );
    expect(byStars).toEqual([10, 8, 5, 3, 3]);
    for (const { rating } of hidden) {
      const reason = rating!.hiddenReason!;
      expect(reason.length).toBeGreaterThanOrEqual(10);
      expect(reason.length).toBeLessThanOrEqual(255);
    }
    expect(Object.values(HIDDEN_REASONS)).toHaveLength(4);
  });

  it('EDS-14 hồ sơ khám: 29 hồ sơ (một ở lịch DaTiepDon); có lịch HoanThanh không hồ sơ, có hồ sơ chưa đánh giá, và DaTiepDon có và không hồ sơ', () => {
    expect(count(EXAM_DEMO_SAMPLES, (s) => s.record !== 'none')).toBe(29);
    expect(
      count(
        EXAM_DEMO_SAMPLES,
        (s) => s.state === 'DaTiepDon' && s.record !== 'none',
      ),
    ).toBe(1);
    expect(
      count(
        EXAM_DEMO_SAMPLES,
        (s) => s.state === 'HoanThanh' && s.record === 'none' && !s.rating,
      ),
    ).toBe(1);
    expect(
      count(
        EXAM_DEMO_SAMPLES,
        (s) => s.state === 'HoanThanh' && s.record !== 'none' && !s.rating,
      ),
    ).toBe(1);
    // Đánh giá không phụ thuộc hồ sơ (DGB-13): có lịch không hồ sơ mà vẫn có đánh giá.
    expect(
      count(EXAM_DEMO_SAMPLES, (s) => s.record === 'none' && !!s.rating),
    ).toBe(2);
    expect(count(EXAM_DEMO_SAMPLES, (s) => s.record === 'followUp')).toBe(2);
    expect(FOLLOW_UP_DAYS).toBeLessThanOrEqual(365);
  });

  it('EDS-14 đánh giá ở bốn chi nhánh: 14, 5, 5, 5 (Admin Chi nhánh gán chi nhánh mẫu 1 chỉ thấy 14)', () => {
    const perBranch = CATALOG_BRANCHES.map((b) =>
      count(ratings, (s) => branchOf(s.doctorKey) === b.ten),
    );
    expect(perBranch).toEqual([14, 5, 5, 5]);
  });

  it('EDS-14 nhận xét: đúng 1.000 đơn vị UTF-16, emoji nằm đúng điểm cắt 200, nhiều dòng, chữ giống HTML/spam, ký tự LIKE, và nhiều đánh giá không nhận xét', () => {
    const comments = ratings.map((s) => s.rating!.comment);
    expect(COMMENT_LONGEST).toHaveLength(1000);
    expect(COMMENT_LONGEST).toBe(COMMENT_LONGEST.trim());
    // Cặp thay thế ở vị trí 199 (nửa đầu) và 200 (nửa sau): cắt 200 đơn vị phải lùi một đơn vị.
    expect(COMMENT_EMOJI_AT_CUT.charCodeAt(199)).toBeGreaterThanOrEqual(0xd800);
    expect(COMMENT_EMOJI_AT_CUT.charCodeAt(199)).toBeLessThanOrEqual(0xdbff);
    expect(COMMENT_EMOJI_AT_CUT.charCodeAt(200)).toBeGreaterThanOrEqual(0xdc00);
    expect(COMMENT_EMOJI_AT_CUT.charCodeAt(200)).toBeLessThanOrEqual(0xdfff);
    expect(COMMENT_MULTILINE.split('\n').length).toBeGreaterThanOrEqual(3);
    expect(COMMENT_LIKE_CHARS).toContain('%');
    expect(COMMENT_LIKE_CHARS).toContain('_');
    for (const text of [
      COMMENT_LONGEST,
      COMMENT_EMOJI_AT_CUT,
      COMMENT_MULTILINE,
      COMMENT_SPAM_TEXT,
      COMMENT_LIKE_CHARS,
    ])
      expect(comments).toContain(text);
    expect(count(comments, (c) => c === null)).toBe(6);
    expect(comments.every((c) => c === null || c.length <= 1000)).toBe(true);
  });

  it('EDS-14 sáu bệnh nhân mẫu: email example.invalid, họ tên có dấu hợp lệ (một tên 85 ký tự), SĐT 10 số, không trùng nhau', () => {
    expect(EXAM_DEMO_PATIENTS).toHaveLength(6);
    for (const p of EXAM_DEMO_PATIENTS) {
      expect(p.email.endsWith('@example.invalid')).toBe(true);
      expect(isValidEmail(p.email)).toBe(true);
      expect(isValidFullName(p.name)).toBe(true);
      expect(normalizePhone(p.phone)).toBe(p.phone);
    }
    expect(Math.max(...EXAM_DEMO_PATIENTS.map((p) => p.name.length))).toBe(85);
    for (const key of ['email', 'name', 'phone'] as const)
      expect(new Set(EXAM_DEMO_PATIENTS.map((p) => p[key])).size).toBe(6);
    // Mỗi bệnh nhân mẫu đặt đủ nhiều lịch để tên xuất hiện lặp ở danh sách kiểm duyệt.
    for (let key = 1; key <= 6; key += 1)
      expect(
        count(EXAM_DEMO_SAMPLES, (s) => s.bookerKey === key),
      ).toBeGreaterThanOrEqual(3);
  });

  it('EDS-14 ba hồ sơ người thân của patient@example.invalid (một ngừng dùng) và mọi lịch người thân tham chiếu đúng một hồ sơ có thật', () => {
    expect(EXAM_DEMO_RELATIVES).toHaveLength(3);
    expect(count(EXAM_DEMO_RELATIVES, (r) => !r.active)).toBe(1);
    for (const r of EXAM_DEMO_RELATIVES)
      expect(isValidFullName(r.hoTen)).toBe(true);
    const names = new Set(EXAM_DEMO_RELATIVES.map((r) => r.hoTen));
    expect(names.size).toBe(3);
    const relativeSamples = EXAM_DEMO_SAMPLES.filter((s) => s.relative);
    expect(relativeSamples).toHaveLength(3);
    for (const s of relativeSamples) {
      expect(names.has(s.relative!)).toBe(true);
      // Người thân chỉ thuộc tài khoản dev-accounts (bookerKey 0): khoá ngoại kép buộc cùng chủ.
      expect(s.bookerKey).toBe(0);
    }
  });

  it('EDS-14 mọi doctorKey và bookerKey đổi được thành email; số lịch theo bác sĩ đúng 12, 4, 3, 3, 2, 3, 2, 3, 2', () => {
    for (const s of EXAM_DEMO_SAMPLES) {
      expect(doctorEmail(s.doctorKey)).toMatch(/@example\.(invalid|com)$/);
      expect(bookerEmail(s.bookerKey)).toMatch(/@example\.invalid$/);
    }
    const perDoctor = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) =>
      count(EXAM_DEMO_SAMPLES, (s) => s.doctorKey === k),
    );
    expect(perDoctor).toEqual([12, 4, 3, 3, 2, 3, 2, 3, 2]);
    expect(() => doctorEmail(9)).toThrow();
    expect(() => bookerEmail(7)).toThrow();
  });

  it('EDS-14 mọi chuỗi chữ (hồ sơ, nhận xét, lý do ẩn) không có dạng bí mật: redactText không đổi chuỗi; hồ sơ 1 đến 2.000 đơn vị', () => {
    const texts = [
      ...EXAM_DEMO_RECORDS.flatMap((r) => [
        r.trieuChung,
        r.chanDoanSoBo,
        r.huongXuLy,
      ]),
      ...ratings.flatMap((s) => (s.rating!.comment ? [s.rating!.comment] : [])),
      ...Object.values(HIDDEN_REASONS),
    ];
    for (const text of texts) expect(redactText(text)).toBe(text);
    for (const r of EXAM_DEMO_RECORDS)
      for (const field of [r.trieuChung, r.chanDoanSoBo, r.huongXuLy]) {
        expect(field.length).toBeGreaterThanOrEqual(1);
        expect(field.length).toBeLessThanOrEqual(2000);
        expect(field).toBe(field.trim());
      }
  });

  it('EDS-14 số hàng mỗi lần chạy đầu: 130 (ca, lịch, hồ sơ, đánh giá, nhật ký) cộng 18 (tài khoản, hồ sơ bệnh nhân, ví) cộng 3 (người thân) = 151', () => {
    const fromSamples = EXAM_DEMO_SAMPLES.reduce(
      (sum, s) => sum + sampleRowCount(s),
      0,
    );
    expect(fromSamples).toBe(130);
    expect(fromSamples + EXAM_DEMO_PATIENTS.length * 3 + 3).toBe(151);
  });
});

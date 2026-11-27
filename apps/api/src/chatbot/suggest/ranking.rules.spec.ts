import {
  DEGREE_BONUS_YEARS,
  EXPERIENCE_CAP_YEARS,
  experienceYearsOf,
  parseTenths,
  parseWeight,
  rankDoctors,
  ratingTenthsOf,
  scoreOf,
  type RankCandidate,
} from './ranking.rules.js';

// chatbot B4 — GOI-01 (bảng điểm theo công thức PLAN 5.11 bước 6) và ca bổ sung B4-01…B4-12.
// MỌI giá trị mong đợi là số viết tay từ công thức, không gọi lại hàm đang kiểm để tính.
const W = { w1: 60, w2: 40 }; // w1 = 0,60 và w2 = 0,40 (mặc định đề xuất của 1.2.1)

function doctor(over: Partial<RankCandidate> = {}): RankCandidate {
  return {
    bacSiId: '1',
    hoTen: 'Bác sĩ Mẫu',
    soNamKinhNghiem: 0,
    hocVi: 'BS',
    soDanhGia: 0,
    diemTrungBinh: null,
    ...over,
  };
}

describe('GOI-01 điểm = w1 × rating% + w2 × kinh nghiệm% (số nguyên)', () => {
  it('đủ 5 lượt: dùng điểm RIÊNG; 4,5 sao ⇒ 90%, 10 năm + TS (5) = 15 năm ⇒ 75% ⇒ 60×90 + 40×75 = 8.400', () => {
    const candidate = doctor({
      soDanhGia: 10,
      diemTrungBinh: '4.5',
      soNamKinhNghiem: 10,
      hocVi: 'TS',
    });
    expect(scoreOf(candidate, W, 40)).toBe(8400);
  });

  it('dưới 5 lượt (4): dùng điểm HỆ THỐNG dù điểm riêng cao: hệ thống 4,0 ⇒ 80%, 10 năm BS ⇒ 50% ⇒ 4.800 + 2.000 = 6.800', () => {
    const candidate = doctor({
      soDanhGia: 4,
      diemTrungBinh: '5.0',
      soNamKinhNghiem: 10,
    });
    expect(scoreOf(candidate, W, 40)).toBe(6800);
  });

  it('đúng 5 lượt là biên: dùng điểm riêng (3,0 ⇒ 60%), 0 năm BS ⇒ 0% ⇒ 60×60 = 3.600', () => {
    const candidate = doctor({ soDanhGia: 5, diemTrungBinh: '3.0' });
    expect(scoreOf(candidate, W, 50)).toBe(3600);
  });

  it('không có lượt nào và hệ thống cũng chưa có đánh giá (null) ⇒ rating 0; 20 năm ⇒ 100% ⇒ 40×100 = 4.000', () => {
    const candidate = doctor({ soNamKinhNghiem: 20 });
    expect(ratingTenthsOf(candidate, null)).toBe(0);
    expect(scoreOf(candidate, W, null)).toBe(4000);
  });

  it('không có lượt nào nhưng hệ thống có điểm (3,5): nhận điểm hệ thống ⇒ 70%', () => {
    expect(ratingTenthsOf(doctor(), 35)).toBe(35);
    expect(scoreOf(doctor(), W, 35)).toBe(60 * 70);
  });

  it('đủ năm học vị: quy đổi BS 0, ThS 2, TS 5, PGS 8, GS 12 (0 năm gốc, chỉ tính kinh nghiệm: w1 = 0, w2 = 100)', () => {
    const only = { w1: 0, w2: 100 };
    const score = (hocVi: RankCandidate['hocVi']) =>
      scoreOf(doctor({ hocVi }), only, null);
    expect(score('BS')).toBe(0);
    expect(score('ThS')).toBe(100 * 10); // 2 năm ⇒ 10%
    expect(score('TS')).toBe(100 * 25); // 5 năm ⇒ 25%
    expect(score('PGS')).toBe(100 * 40); // 8 năm ⇒ 40%
    expect(score('GS')).toBe(100 * 60); // 12 năm ⇒ 60%
    expect(DEGREE_BONUS_YEARS).toEqual({
      BS: 0,
      ThS: 2,
      TS: 5,
      PGS: 8,
      GS: 12,
    });
  });

  it('trần 20 năm: đúng 20 (15 + TS 5) và vượt (16 + TS 5 = 21; 18 + GS 12 = 30) đều 100%', () => {
    const years = (soNamKinhNghiem: number, hocVi: RankCandidate['hocVi']) =>
      experienceYearsOf(doctor({ soNamKinhNghiem, hocVi }));
    expect(years(15, 'TS')).toBe(20);
    expect(years(16, 'TS')).toBe(20);
    expect(years(18, 'GS')).toBe(20);
    expect(years(14, 'TS')).toBe(19); // dưới trần thì giữ nguyên
    expect(EXPERIENCE_CAP_YEARS).toBe(20);
    const top = doctor({
      soNamKinhNghiem: 18,
      hocVi: 'GS',
      soDanhGia: 20,
      diemTrungBinh: '5.0',
    });
    expect(scoreOf(top, W, null)).toBe(60 * 100 + 40 * 100);
  });

  it('học vị không đọc được (null) quy đổi 0, không ném lỗi', () => {
    expect(experienceYearsOf(doctor({ soNamKinhNghiem: 7, hocVi: null }))).toBe(
      7,
    );
  });

  it('mọi điểm là số nguyên (không số thực): 0,6 và 0,4 không sinh ra 0,6000000000000001', () => {
    for (const diemTrungBinh of ['1.1', '2.3', '3.7', '4.9']) {
      for (let years = 0; years <= 20; years += 1) {
        const candidate = doctor({
          soDanhGia: 9,
          diemTrungBinh,
          soNamKinhNghiem: years,
        });
        expect(Number.isInteger(scoreOf(candidate, W, 33))).toBe(true);
      }
    }
  });
});

describe('GOI-01 hoà điểm: số năm gốc giảm dần, rồi họ tên, rồi id', () => {
  // w1 = 100, w2 = 0 và cùng rating ⇒ mọi người hoà điểm; thứ tự chỉ còn do ba khoá hoà điểm quyết định.
  const tie = { w1: 100, w2: 0 };
  const same = { soDanhGia: 5, diemTrungBinh: '4.0' };
  const ids = (list: readonly RankCandidate[]) => list.map((c) => c.bacSiId);

  it('khoá 1: nhiều năm hơn đứng trước (năm GỐC, không cộng học vị: 3 năm GS vẫn sau 4 năm BS)', () => {
    const a = doctor({
      bacSiId: '1',
      hoTen: 'A',
      soNamKinhNghiem: 3,
      hocVi: 'GS',
      ...same,
    });
    const b = doctor({
      bacSiId: '2',
      hoTen: 'B',
      soNamKinhNghiem: 4,
      hocVi: 'BS',
      ...same,
    });
    expect(ids(rankDoctors([a, b], tie, null))).toEqual(['2', '1']);
  });

  it('khoá 2: cùng năm thì họ tên tăng dần (tiếng Việt)', () => {
    const an = doctor({
      bacSiId: '7',
      hoTen: 'An',
      soNamKinhNghiem: 5,
      ...same,
    });
    const binh = doctor({
      bacSiId: '3',
      hoTen: 'Bình',
      soNamKinhNghiem: 5,
      ...same,
    });
    expect(ids(rankDoctors([binh, an], tie, null))).toEqual(['7', '3']);
  });

  it('khoá 3: cùng năm, cùng tên thì id SỐ tăng dần (9 trước 10; id lớn hơn 2^53 vẫn đúng)', () => {
    const make = (bacSiId: string) =>
      doctor({ bacSiId, hoTen: 'Trùng Tên', soNamKinhNghiem: 5, ...same });
    expect(ids(rankDoctors([make('10'), make('9')], tie, null))).toEqual([
      '9',
      '10',
    ]);
    expect(
      ids(
        rankDoctors(
          [make('9007199254740993'), make('9007199254740992')],
          tie,
          null,
        ),
      ),
    ).toEqual(['9007199254740992', '9007199254740993']);
  });

  it('điểm cao hơn luôn thắng ba khoá hoà điểm (ít năm, tên cuối bảng, id lớn vẫn đứng đầu)', () => {
    const low = doctor({
      bacSiId: '1',
      hoTen: 'A',
      soNamKinhNghiem: 30,
      soDanhGia: 5,
      diemTrungBinh: '3.9',
    });
    const high = doctor({
      bacSiId: '99',
      hoTen: 'Z',
      soNamKinhNghiem: 0,
      soDanhGia: 5,
      diemTrungBinh: '4.0',
    });
    expect(ids(rankDoctors([low, high], tie, null))).toEqual(['99', '1']);
  });

  it('B4-01: không đổi mảng đầu vào và trả mảng mới', () => {
    const input = [
      doctor({ bacSiId: '1', soNamKinhNghiem: 1 }),
      doctor({ bacSiId: '2', soNamKinhNghiem: 9 }),
    ];
    const before = [...input];
    const out = rankDoctors(input, W, null);
    expect(input).toEqual(before);
    expect(out).not.toBe(input);
  });
});

describe('B4-02 đổi trọng số đổi thứ tự (nền của GOI-02)', () => {
  const star = doctor({
    bacSiId: '1',
    hoTen: 'Sao',
    soDanhGia: 9,
    diemTrungBinh: '5.0',
    soNamKinhNghiem: 0,
  });
  const senior = doctor({
    bacSiId: '2',
    hoTen: 'Lão',
    soDanhGia: 9,
    diemTrungBinh: '3.0',
    soNamKinhNghiem: 20,
  });

  it('w1 = 0,9, w2 = 0,1: Sao (90×100 + 10×0 = 9.000) trước Lão (90×60 + 10×100 = 6.400)', () => {
    expect(
      rankDoctors([senior, star], { w1: 90, w2: 10 }, null).map(
        (c) => c.bacSiId,
      ),
    ).toEqual(['1', '2']);
  });

  it('w1 = 0,1, w2 = 0,9: Lão (10×60 + 90×100 = 9.600) trước Sao (10×100 + 90×0 = 1.000)', () => {
    expect(
      rankDoctors([star, senior], { w1: 10, w2: 90 }, null).map(
        (c) => c.bacSiId,
      ),
    ).toEqual(['2', '1']);
  });

  it('cả hai trọng số 0: mọi điểm 0, thứ tự chỉ còn khoá hoà điểm (Lão nhiều năm hơn đứng trước)', () => {
    expect(
      rankDoctors([star, senior], { w1: 0, w2: 0 }, null).map((c) => c.bacSiId),
    ).toEqual(['2', '1']);
  });
});

describe('B4-03 parseWeight: chuỗi decimal ⇒ phần trăm nguyên, không qua số thực', () => {
  it.each([
    ['0.60', 60],
    ['0.40', 40],
    ['0.4', 40],
    ['1.00', 100],
    ['1', 100],
    ['0.00', 0],
    ['0.05', 5],
    ['0.07', 7], // 0,07 × 100 = 7,000000000000001 nếu đi qua số thực
    ['0.29', 29], // 0,29 × 100 = 28,999999999999996
    ['0.57', 57], // 0,57 × 100 = 56,99999999999999
  ])('%s ⇒ %d', (text, expected) => {
    expect(parseWeight(text)).toBe(expected);
  });

  it.each([
    '',
    '.5',
    '0.',
    '0.601',
    '-0.1',
    '1e0',
    'abc',
    '10.00',
    ' 0.6',
    '0,60',
  ])('sai dạng %j ⇒ RangeError (không âm thầm cho điểm 0)', (text) => {
    expect(() => parseWeight(text)).toThrow(RangeError);
  });
});

describe('B4-04 parseTenths: điểm sao dạng chuỗi ⇒ phần mười nguyên', () => {
  it.each([
    ['4.5', 45],
    ['4.0', 40],
    ['5', 50],
    ['5.0', 50],
    ['0.0', 0],
    ['1.1', 11],
  ])('%s ⇒ %d', (text, expected) => {
    expect(parseTenths(text)).toBe(expected);
  });

  it.each(['', '5.1', '9.9', '4.55', '-1', 'abc', '4,5', '.5'])(
    'sai dạng hay quá 5,0 %j ⇒ RangeError',
    (text) => {
      expect(() => parseTenths(text)).toThrow(RangeError);
    },
  );
});

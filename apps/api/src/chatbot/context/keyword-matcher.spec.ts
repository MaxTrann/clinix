import type { DoctorRow } from './context.types.js';
import {
  buildQuestionWords,
  containsPhrase,
  foldedWords,
  matchServices,
  rankDoctors,
} from './keyword-matcher.js';

// chatbot B2 — khớp từ khoá không dấu (NGC-03). Hàm thuần.

function doctor(id: string, over: Partial<DoctorRow> = {}): DoctorRow {
  return {
    bacSiId: id,
    hoTen: `Bác Sĩ Mẫu${id} Hùng`,
    chucDanh: 'BS',
    chuyenKhoaId: '1',
    chuyenKhoaTen: 'Nội tổng quát',
    chiNhanhId: '1',
    chiNhanhTen: 'Chi nhánh Một',
    dichVuKhamId: '1',
    dichVuTen: 'Khám chuyên khoa',
    giaKham: '200000.00',
    ...over,
  };
}

const rank = (
  doctors: DoctorRow[],
  question: string,
  options: { previous?: string; branchId?: string | null; max?: number } = {},
) =>
  rankDoctors(
    doctors,
    buildQuestionWords(question, options.previous),
    options.branchId,
    options.max ?? 8,
  ).map((d) => d.bacSiId);

describe('chatbot B2 — khớp từ khoá không dấu', () => {
  it('NGC-03: foldedWords bỏ dấu, chữ thường, đ thành d', () => {
    expect(foldedWords('Nguyễn Đức  Ánh, Tim-mạch!')).toEqual([
      'nguyen',
      'duc',
      'anh',
      'tim',
      'mach',
    ]);
  });

  it('NGC-03: containsPhrase cần các từ LIỀN NHAU, cụm rỗng không khớp', () => {
    const words = ['bac', 'si', 'nguyen', 'minh', 'anh', 'kham'];
    expect(containsPhrase(words, ['minh', 'anh'])).toBe(true);
    expect(containsPhrase(words, ['nguyen', 'anh'])).toBe(false);
    expect(containsPhrase(words, [])).toBe(false);
    expect(containsPhrase([], ['a'])).toBe(false);
  });

  it('NGC-03: tên bác sĩ gõ không dấu khớp tên có dấu', () => {
    const a = doctor('1', { hoTen: 'Nguyễn Minh Anh' });
    const b = doctor('2', { hoTen: 'Trần Quốc Huy' });
    expect(rank([a, b], 'cho toi hoi bac si nguyen minh anh')).toEqual(['1']);
    expect(rank([a, b], 'BÁC SĨ NGUYỄN MINH ANH KHÁM NGÀY NÀO')).toEqual(['1']);
  });

  it('NGC-03: hai từ cuối của họ tên cũng khớp ("bác sĩ Minh Anh")', () => {
    const a = doctor('1', { hoTen: 'Nguyễn Minh Anh' });
    expect(rank([a], 'bác sĩ minh anh có lịch không')).toEqual(['1']);
  });

  it('NGC-03: một chữ của họ tên KHÔNG đủ để khớp ("mai", "anh" là từ thường)', () => {
    const a = doctor('1', { hoTen: 'Lê Thị Mai' });
    const b = doctor('2', { hoTen: 'Nguyễn Minh Anh' });
    expect(rank([a, b], 'ngày mai anh khám được không')).toEqual([]);
  });

  it('NGC-03: tên một chữ không bao giờ khớp', () => {
    expect(rank([doctor('1', { hoTen: 'Mai' })], 'bác sĩ mai')).toEqual([]);
  });

  it('NGC-03: khớp theo chuyên khoa và theo chi nhánh', () => {
    const tim = doctor('1', { chuyenKhoaTen: 'Tim mạch' });
    const nhi = doctor('2', { chuyenKhoaTen: 'Nhi khoa' });
    const q1 = doctor('3', {
      chiNhanhId: '2',
      chiNhanhTen: 'Chi nhánh Quận 1',
    });
    expect(rank([tim, nhi, q1], 'khoa tim mach co ai')).toEqual(['1']);
    expect(rank([tim, nhi, q1], 'bác sĩ ở chi nhánh quận 1')).toEqual(['3']);
  });

  it('NGC-03: không có từ khoá nào khớp thì KHÔNG phát bác sĩ nào', () => {
    const doctors = [doctor('1'), doctor('2'), doctor('3')];
    expect(rank(doctors, 'phòng khám mở cửa lúc mấy giờ')).toEqual([]);
    expect(rank(doctors, 'xin chào')).toEqual([]);
    expect(rank(doctors, 'xin chào', { branchId: '1' })).toEqual([]);
  });

  it('NGC-03: tối đa 8 bác sĩ, hoà điểm giữ thứ tự của danh sách', () => {
    const doctors = Array.from({ length: 12 }, (_, i) =>
      doctor(String(i + 1), { chuyenKhoaTen: 'Tim mạch' }),
    );
    expect(rank(doctors, 'khoa tim mạch')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
    ]);
    expect(rank(doctors, 'khoa tim mạch', { max: 3 })).toEqual(['1', '2', '3']);
  });

  it('NGC-03: chi nhánh đang chọn được ƯU TIÊN giữa các bác sĩ đã khớp', () => {
    const a = doctor('1', { chuyenKhoaTen: 'Tim mạch', chiNhanhId: '1' });
    const b = doctor('2', { chuyenKhoaTen: 'Tim mạch', chiNhanhId: '2' });
    const c = doctor('3', { chuyenKhoaTen: 'Tim mạch', chiNhanhId: '2' });
    expect(rank([a, b, c], 'khoa tim mạch', { branchId: '2' })).toEqual([
      '2',
      '3',
      '1',
    ]);
    expect(rank([a, b, c], 'khoa tim mạch', { branchId: '2', max: 2 })).toEqual(
      ['2', '3'],
    );
    expect(rank([a, b, c], 'khoa tim mạch', { branchId: null })).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('NGC-03: điểm cao hơn thắng chi nhánh đang chọn (tên đầy đủ 100 > chuyên khoa 40 + ưu tiên 5)', () => {
    const named = doctor('1', {
      hoTen: 'Nguyễn Minh Anh',
      chuyenKhoaTen: 'Nhi khoa',
      chiNhanhId: '9',
    });
    const inBranch = doctor('2', {
      chuyenKhoaTen: 'Tim mạch',
      chiNhanhId: '1',
    });
    expect(
      rank([inBranch, named], 'bác sĩ nguyễn minh anh khoa tim mạch', {
        branchId: '1',
      }),
    ).toEqual(['1', '2']);
  });

  it('NGC-03: lượt người dùng ngay trước cũng được xét, nhưng cụm không bắc qua hai lượt', () => {
    const a = doctor('1', { hoTen: 'Nguyễn Minh Anh' });
    expect(
      rank([a], 'bác sĩ đó khám ngày nào', {
        previous: 'cho hỏi bác sĩ nguyễn minh anh',
      }),
    ).toEqual(['1']);
    expect(
      rank([a], 'anh khám ngày nào', { previous: 'cho hỏi nguyễn minh' }),
    ).toEqual([]);
  });

  it('NGC-03: matchServices theo tên liền nhau, giữ thứ tự, tối đa max', () => {
    const services = [
      { id: '1', ten: 'Siêu âm bụng' },
      { id: '2', ten: 'Khám tổng quát' },
      { id: '3', ten: 'Siêu âm tim' },
    ];
    const words = buildQuestionWords(
      'cho hỏi giá siêu âm bụng và khám tổng quát',
    );
    expect(matchServices(services, words, 8).map((s) => s.id)).toEqual([
      '1',
      '2',
    ]);
    expect(matchServices(services, words, 1).map((s) => s.id)).toEqual(['1']);
    expect(matchServices(services, buildQuestionWords('xin chào'), 8)).toEqual(
      [],
    );
  });
});

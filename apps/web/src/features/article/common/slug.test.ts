import { SLUG_MAX_LENGTH, slugify } from './slug';

// article F2, ABG-08: `slugify` là hàm thuần (PLAN article T3, MH20): bỏ dấu, `đ` thành `d`, ký tự lạ thành `-`, tối đa 80, chạy hai lần không đổi.
describe('slugify', () => {
  it('ABG-08 bỏ dấu thanh, mũ, móc, chữ thường, khoảng trắng thành một dấu gạch ngang', () => {
    expect(slugify('Sốt xuất huyết')).toBe('sot-xuat-huyet');
    expect(slugify('Phòng ngừa SỐT XUẤT HUYẾT tại nhà')).toBe(
      'phong-ngua-sot-xuat-huyet-tai-nha',
    );
    expect(slugify('Ăn uống lành mạnh, ngủ đủ giấc')).toBe(
      'an-uong-lanh-manh-ngu-du-giac',
    );
  });

  it('ABG-08 `đ` và `Đ` thành `d` (NFD không tách được chữ này)', () => {
    expect(slugify('Đau đầu')).toBe('dau-dau');
    expect(slugify('ĐÀ NẴNG')).toBe('da-nang');
    expect(slugify('đ')).toBe('d');
  });

  it('ABG-08 chữ số giữ nguyên; ký tự lạ, dấu câu, ký hiệu thành một dấu gạch ngang; gạch liền nhau gộp một; gạch hai đầu bỏ', () => {
    expect(slugify('COVID-19: 5 điều cần biết!')).toBe(
      'covid-19-5-dieu-can-biet',
    );
    expect(slugify('  --Tim   mạch__&__huyết áp--  ')).toBe(
      'tim-mach-huyet-ap',
    );
    expect(slugify('a/b\\c?d=e#f')).toBe('a-b-c-d-e-f');
  });

  it('ABG-08 biên: rỗng, chỉ khoảng trắng, chỉ ký tự lạ, chỉ emoji hay chữ ngoài Latinh ⇒ chuỗi rỗng (đường dẫn chỉ còn mã bài)', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!! ??? ...')).toBe('');
    expect(slugify('🙂🙂')).toBe('');
    expect(slugify('日本語')).toBe('');
  });

  it('ABG-08 biên: tối đa 80 ký tự và không kết thúc bằng dấu gạch ngang sau khi cắt', () => {
    const long = slugify('a'.repeat(200));
    expect(long).toHaveLength(SLUG_MAX_LENGTH);
    expect(SLUG_MAX_LENGTH).toBe(80);

    // Cắt đúng giữa hai từ: ký tự thứ 80 là `-` thì phải bỏ
    const words = `${'a'.repeat(79)} bcd`;
    const cut = slugify(words);
    expect(cut).toBe('a'.repeat(79));
    expect(cut.endsWith('-')).toBe(false);

    // Đúng 80 ký tự thì giữ nguyên
    expect(slugify('b'.repeat(80))).toBe('b'.repeat(80));
    expect(slugify('b'.repeat(81))).toBe('b'.repeat(80));
  });

  it('ABG-08 chạy hai lần không đổi (idempotent), kể cả khi cắt ở 80', () => {
    for (const title of [
      'Sốt xuất huyết',
      'Đau đầu',
      '  --Tim   mạch--  ',
      'a'.repeat(200),
      `${'ab '.repeat(40)}cuối`,
      '🙂',
      '',
    ]) {
      const once = slugify(title);
      expect(slugify(once)).toBe(once);
    }
  });

  it('ABG-08 kết quả chỉ gồm a-z, 0-9 và dấu gạch ngang (an toàn cho đường dẫn)', () => {
    for (const title of [
      'Tiêu đề có “nháy cong”, <script>alert(1)</script> và %2F',
      'Trẻ em (0–6 tuổi): ăn gì?',
    ]) {
      expect(slugify(title)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});

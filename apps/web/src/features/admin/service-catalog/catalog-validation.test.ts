import { validateGroupInput, validateServiceInput } from './catalog-validation';

// AF3-11 (nhóm dịch vụ) và AF3-12 (dịch vụ khám), phần kiểm tra dữ liệu phía form (admin PR2 mục 6.3). Thông báo là `[đề xuất]` đã được Đại duyệt.

describe('validateGroupInput (AF3-11)', () => {
  it('AF3-11 hợp lệ: trả giá trị đã đổi kiểu', () => {
    const result = validateGroupInput('Khám tổng quát', '3');
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({ ten: 'Khám tổng quát', thuTuHienThi: 3 });
  });

  it.each([[''], ['   ']])('AF3-11 tên %j ⇒ lỗi ở ô tên', (name) => {
    const result = validateGroupInput(name, '1');
    expect(result.errors).toEqual({ ten: 'Vui lòng nhập tên nhóm.' });
    expect(result.value).toBeUndefined();
  });

  it.each([[''], ['-1'], ['1.5'], ['1e2'], ['abc'], ['99999999999999999999']])(
    'AF3-11 thứ tự %j ⇒ lỗi ở ô thứ tự (trống không còn bị coi là 0)',
    (order) => {
      const result = validateGroupInput('Nhóm', order);
      expect(result.errors).toEqual({
        thuTuHienThi: 'Thứ tự phải là số nguyên không âm.',
      });
      expect(result.value).toBeUndefined();
    },
  );

  it('AF3-11 biên: thứ tự 0 hợp lệ', () => {
    expect(validateGroupInput('Nhóm', '0').value).toEqual({
      ten: 'Nhóm',
      thuTuHienThi: 0,
    });
  });

  it('AF3-11 lỗi ở cả hai ô cùng lúc', () => {
    expect(validateGroupInput('', '').errors).toEqual({
      ten: 'Vui lòng nhập tên nhóm.',
      thuTuHienThi: 'Thứ tự phải là số nguyên không âm.',
    });
  });
});

const valid = {
  name: 'Khám nội tổng quát',
  groupId: '2',
  duration: '30',
  priceDigits: '150000',
};

describe('validateServiceInput (AF3-12)', () => {
  it('AF3-12 hợp lệ: giá gửi đi là chuỗi chữ số thuần', () => {
    const result = validateServiceInput(valid);
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      nhomDichVuId: '2',
      ten: 'Khám nội tổng quát',
      thoiLuong: 30,
      giaMacDinh: '150000',
    });
  });

  it.each([[''], ['   ']])('AF3-12 tên %j ⇒ lỗi ở ô tên', (name) => {
    expect(validateServiceInput({ ...valid, name }).errors).toEqual({
      ten: 'Vui lòng nhập tên dịch vụ.',
    });
  });

  it('AF3-12 chưa chọn nhóm ⇒ lỗi ở ô nhóm', () => {
    expect(validateServiceInput({ ...valid, groupId: '' }).errors).toEqual({
      nhomDichVuId: 'Vui lòng chọn nhóm dịch vụ.',
    });
  });

  it.each([[''], ['0'], ['-5'], ['1.5'], ['1e2'], ['abc'], ['2147483648']])(
    'AF3-12 thời lượng %j ⇒ lỗi ở ô thời lượng',
    (duration) => {
      const result = validateServiceInput({ ...valid, duration });
      expect(result.errors).toEqual({
        thoiLuong: 'Thời lượng phải là số nguyên dương.',
      });
      expect(result.value).toBeUndefined();
    },
  );

  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
  ])('AF3-12 biên: thời lượng %s hợp lệ', (duration, expected) => {
    expect(validateServiceInput({ ...valid, duration }).value?.thoiLuong).toBe(
      expected,
    );
  });

  it('AF3-12 giá trống ⇒ "Vui lòng nhập giá."', () => {
    expect(validateServiceInput({ ...valid, priceDigits: '' }).errors).toEqual({
      giaMacDinh: 'Vui lòng nhập giá.',
    });
  });

  it('AF3-12 giá 0 ⇒ "Giá phải lớn hơn 0."', () => {
    expect(validateServiceInput({ ...valid, priceDigits: '0' }).errors).toEqual(
      {
        giaMacDinh: 'Giá phải lớn hơn 0.',
      },
    );
  });

  it('AF3-12 biên: giá 1 đồng hợp lệ', () => {
    expect(
      validateServiceInput({ ...valid, priceDigits: '1' }).value?.giaMacDinh,
    ).toBe('1');
  });

  it('AF3-12 lỗi ở nhiều ô: đủ từng ô, thứ tự khóa theo thứ tự ô trên form', () => {
    const result = validateServiceInput({
      name: '',
      groupId: '',
      duration: '0',
      priceDigits: '',
    });
    expect(Object.keys(result.errors)).toEqual([
      'ten',
      'nhomDichVuId',
      'thoiLuong',
      'giaMacDinh',
    ]);
  });
});

import { validateNewPassword } from './new-password';

// Task F5: hàm tách từ bước 3 của F4, dùng chung F4 và F5 (TRACKING auth F5-D). Mã ca NP-nn là [đề xuất]; SE-08, N9, N10.
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';

it('NP-01 N9 dấu cách hai đầu được tính vào độ dài, không trim', () => {
  // 8 ký tự kể cả hai dấu cách; trim thì chỉ còn 6
  expect(validateNewPassword(' Abc@12 ', ' Abc@12 ')).toEqual({});
  expect(validateNewPassword('Abc@12', 'Abc@12')).toEqual({
    matKhauMoi: RULE,
  });
});

it('NP-02 xác nhận chỉ khác dấu cách cuối: không khớp', () => {
  expect(validateNewPassword('Abc@1234', 'Abc@1234 ')).toEqual({
    xacNhan: 'Mật khẩu xác nhận không khớp.',
  });
});

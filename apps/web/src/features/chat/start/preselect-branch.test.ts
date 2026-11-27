import { describe, expect, it } from 'vitest';
import { preselectBranch, type PickerData } from './preselect-branch';

// chat F4 — chi nhánh chọn sẵn khi nhắn lễ tân (PLAN chat Q4, MH1, MH2; WCH-12): theo API, rồi chi nhánh đang chọn, "Toàn quốc" phải chọn. Mã ca CPB-nn là [đề xuất].
const options = [
  { chiNhanhId: '1', ten: 'Quận 1', diaChi: 'a' },
  { chiNhanhId: '2', ten: 'Thủ Đức', diaChi: 'b' },
];
const data = (suggested: PickerData['suggested']): PickerData => ({
  options,
  suggested,
});

describe('chat F4 — preselectBranch (WCH-12)', () => {
  it('WCH-12 CPB-01 máy chủ gợi ý (lịch sắp tới hay đã khám) thắng chi nhánh đang chọn; câu gợi ý theo nguồn', () => {
    expect(
      preselectBranch(data({ chiNhanhId: '2', nguon: 'LichHenSapToi' }), '1'),
    ).toEqual({
      chiNhanhId: '2',
      hint: 'Đã chọn sẵn chi nhánh của lịch hẹn sắp tới.',
    });
    expect(
      preselectBranch(data({ chiNhanhId: '1', nguon: 'LichHenDaKham' }), null),
    ).toEqual({
      chiNhanhId: '1',
      hint: 'Đã chọn sẵn chi nhánh bạn khám gần nhất.',
    });
  });

  it('WCH-12 CPB-02 máy chủ không gợi ý (hay lỗi) ⇒ chi nhánh đang chọn ở trình duyệt', () => {
    const expected = {
      chiNhanhId: '1',
      hint: 'Đã chọn sẵn chi nhánh bạn đang xem.',
    };
    expect(
      preselectBranch(data({ chiNhanhId: null, nguon: null }), '1'),
    ).toEqual(expected);
    expect(preselectBranch(data(null), '1')).toEqual(expected);
  });

  it('WCH-12 CPB-03 (âm) "Toàn quốc" hay chi nhánh không còn trong danh sách ⇒ không chọn sẵn, người dùng phải chọn', () => {
    expect(
      preselectBranch(data({ chiNhanhId: null, nguon: null }), null),
    ).toBeNull();
    expect(
      preselectBranch(data({ chiNhanhId: '99', nguon: 'LichHenSapToi' }), '98'),
    ).toBeNull();
  });
});

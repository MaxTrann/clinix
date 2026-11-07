import { RELATIONSHIP_OPTIONS, relationshipLabel } from './relative-labels';

// patient F6 (TRACKING F6-H): nhãn mối quan hệ (Q15). Mã ca RW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN mục 7.2 mà nó phủ.
describe('nhãn mối quan hệ (Q15)', () => {
  it.each([
    ['Cha', 'Cha'],
    ['Me', 'Mẹ'],
    ['Vo', 'Vợ'],
    ['Chong', 'Chồng'],
    ['Con', 'Con'],
    ['AnhChiEm', 'Anh/Chị/Em'],
    ['OngBa', 'Ông/Bà'],
    ['Khac', 'Khác'],
  ])('RW-01 NT-20 mã %s ⇒ nhãn %s', (code, label) => {
    expect(relationshipLabel(code)).toBe(label);
  });

  it('RW-02 NT-21 ô chọn có đúng 8 mã, đúng thứ tự Q15, mã không trùng', () => {
    expect(RELATIONSHIP_OPTIONS.map((option) => option.label)).toEqual([
      'Cha',
      'Mẹ',
      'Vợ',
      'Chồng',
      'Con',
      'Anh/Chị/Em',
      'Ông/Bà',
      'Khác',
    ]);
    expect(new Set(RELATIONSHIP_OPTIONS.map((o) => o.code)).size).toBe(8);
  });

  it.each(['', 'Mẹ', 'me', 'Anh/Chị/Em', 'constructor', 'toString', 'Khac '])(
    'RW-03 NT-20 mã lạ %j ⇒ null (giao diện hiện "Chưa cập nhật")',
    (code) => {
      expect(relationshipLabel(code)).toBeNull();
    },
  );
});

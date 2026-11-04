import { isRelationship } from './relationship.js';

// patient P1 (TRACKING patient P1-C, P1-F). Test case: NT-03 ở mức luật (quyết định Q15). Danh sách viết tay để bắt việc enum bị đổi.
describe('isRelationship', () => {
  it.each(['Cha', 'Me', 'Vo', 'Chong', 'Con', 'AnhChiEm', 'OngBa', 'Khac'])(
    '(NT-03) hợp lệ: %s',
    (value) => {
      expect(isRelationship(value)).toBe(true);
    },
  );

  it.each([
    'cha',
    'Mẹ',
    'Anh/Chị/Em',
    'anhchiem',
    'Ban',
    ' Cha',
    '',
    null,
    undefined,
    1,
    ['Cha'],
  ])('(NT-03) không hợp lệ: %j', (value) => {
    expect(isRelationship(value)).toBe(false);
  });
});

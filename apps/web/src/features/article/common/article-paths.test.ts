import { ROLE_HOME_PATHS } from '../../auth';
import {
  ARTICLE_ADMIN_NEW_PATH,
  ARTICLE_ADMIN_PATH,
  ARTICLE_ADMIN_SEGMENT,
  ARTICLE_LIST_PATH,
  articleAdminEditPath,
  isArticleId,
} from './article-paths';

// article F1: hằng đường dẫn (PLAN 5.11, T14, T18). Đường dẫn ở thanh bên Admin viết bằng chữ nên khoá từng chữ ở đây.
describe('article-paths', () => {
  it('ABW-01 đường dẫn quản trị khớp từng chữ với gốc khu Quản trị viên của auth và với chữ ở thanh bên', () => {
    expect(ARTICLE_ADMIN_SEGMENT).toBe('bai-viet');
    expect(ARTICLE_ADMIN_PATH).toBe('/admin/bai-viet');
    expect(ARTICLE_ADMIN_PATH).toBe(
      `${ROLE_HOME_PATHS.QuanTriVien}/${ARTICLE_ADMIN_SEGMENT}`,
    );
    expect(ARTICLE_ADMIN_NEW_PATH).toBe('/admin/bai-viet/moi');
  });

  it('ABW-01 đường dẫn công khai của danh sách bài (menu "Cẩm nang" của F2) là /cam-nang', () => {
    expect(ARTICLE_LIST_PATH).toBe('/cam-nang');
  });

  it('ABW-01 đường dẫn sửa bài gắn mã bài, mã lạ được mã hoá', () => {
    expect(articleAdminEditPath('12')).toBe('/admin/bai-viet/12');
    expect(articleAdminEditPath('a/b?c')).toBe('/admin/bai-viet/a%2Fb%3Fc');
  });

  it.each(['1', '12', '9223372036854775807'])(
    'ABW-01 %s là mã bài hợp lệ',
    (id) => {
      expect(isArticleId(id)).toBe(true);
    },
  );

  it.each([
    '',
    '0',
    '01',
    '-1',
    '1.5',
    '1e3',
    'abc',
    'moi',
    ' 1',
    '1 ',
    '12345678901234567890',
  ])('ABW-01 %j KHÔNG phải mã bài (trang không gọi API)', (id) => {
    expect(isArticleId(id)).toBe(false);
  });
});

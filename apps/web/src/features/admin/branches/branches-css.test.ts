import { declarationsOf, readCssSource } from '../testing/css-source';

// CN b1 (PR1 mục 8) phần kiểu của thẻ chi nhánh. Đo Chromium 16/11/2026 ở 375px: nút "Sửa lịch / dịch vụ" (135px, không xuống dòng)
// nằm cạnh khiến danh sách giờ nhận khám chỉ còn 55,9px nên mỗi dòng giờ ngắt thành 4 đến 8 dòng và thẻ cao 1100px. Màn hẹp phải xếp
// nút xuống dưới thẻ. Vitest chạy `css: false` nên khoá giá trị trong nguồn CSS.

const css = readCssSource(import.meta.url, './branches.module.css');

describe('CN b1 kiểu thẻ chi nhánh ở màn hẹp', () => {
  it('thẻ xếp theo cột và nút Sửa lịch căn đầu dòng khi màn hẹp', () => {
    expect(declarationsOf(css, '.branchCard')).toContain(
      'flex-direction: column;',
    );
    expect(declarationsOf(css, '.editButton')).toContain(
      'align-self: flex-start;',
    );
  });

  it('danh sách giờ nhận khám để chữ xuống dòng thay vì cắt bằng dấu ba chấm', () => {
    const declarations = declarationsOf(css, '.scheduleList li');

    expect(declarations).toContain('overflow-wrap: anywhere;');
    expect(declarations).not.toContain('text-overflow');
    expect(declarations).not.toContain('white-space: nowrap');
  });
});

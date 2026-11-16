import { declarationsOf, readCssSource } from '../testing/css-source';

// AF2-08 và AF2-10 phần kiểu của trang chuyên khoa (PR1 mục 2 và 4). Vitest chạy `css: false` nên khoá giá trị trong nguồn CSS;
// khoảng cách thật đo bằng Chromium so với Figma `540:635`.

const css = readCssSource(import.meta.url, './specialty.module.css');

describe('AF2-08 và AF2-10 kiểu của trang chuyên khoa', () => {
  it('AF2-10 ô "Đang hoạt động" cách vùng ảnh đại diện 15px như Figma 540:635', () => {
    const declarations = declarationsOf(css, '.statusField');

    expect(declarations).toContain('margin-top: 15px;');
  });

  it('AF2-08 icon bút chì cùng màu #0092b8 với nút Sửa của trang Loại dịch vụ khám', () => {
    expect(declarationsOf(css, '.rowActions .editAction')).toContain(
      'color: #0092b8;',
    );
  });

  it('AF2-08 icon Ngừng hoạt động tông cam #bb4d00, icon Kích hoạt tông xanh lá #008236', () => {
    expect(declarationsOf(css, '.rowActions .pauseAction')).toContain(
      'color: #bb4d00;',
    );
    expect(declarationsOf(css, '.rowActions .resumeAction')).toContain(
      'color: #008236;',
    );
  });
});

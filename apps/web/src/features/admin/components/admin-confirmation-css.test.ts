import { declarationsOf, readCssSource } from '../../../test/css-source';

// AF1-13 (PR1 mục 3) phần kiểu: hộp xác nhận tone `warning` theo Figma `733:599` (popup "Ngừng hoạt động chuyên khoa?").
// Vitest chạy `css: false` nên khoá giá trị ngay trong nguồn CSS; kích thước thật và tương phản đo bằng Chromium.

const css = readCssSource(import.meta.url, './admin-components.module.css');

describe('AF1-13 kiểu hộp xác nhận tone warning (Figma 733:599)', () => {
  it('nút xác nhận dùng nền token warning #bb4d00 với chữ trắng, lệch Figma #fe9a00 vì chữ trắng trên đó chỉ khoảng 2,1:1', () => {
    const declarations = declarationsOf(
      css,
      '.confirmationDialog .dialogActions .warningAction',
    );

    expect(declarations).toContain('border-color: #bb4d00;');
    expect(declarations).toContain('background: #bb4d00;');
    expect(declarations).toContain('color: #fff;');
  });

  it('khối ghi chú: nền #fffbeb, viền #fef3c6, chữ #bb4d00, cỡ 11.25px/15px, bo 9.375px, đệm 11.25px', () => {
    const declarations = declarationsOf(css, '.confirmationDialog .dialogNote');

    expect(declarations).toContain('background: #fffbeb;');
    expect(declarations).toContain('border: 1px solid #fef3c6;');
    expect(declarations).toContain('border-radius: 9.375px;');
    expect(declarations).toContain('color: #bb4d00;');
    expect(declarations).toContain('font-size: 11.25px;');
    expect(declarations).toContain('line-height: 15px;');
    expect(declarations).toContain('padding: 11.25px;');
  });

  it('nút của biến thể warning không ngắt nhãn dài thành hai dòng ở màn hẹp (đo Chromium 375px)', () => {
    const declarations = declarationsOf(
      css,
      '.warningDialog .dialogActions button',
    );

    expect(declarations).toContain('min-width: max-content;');
    expect(declarations).toContain('white-space: nowrap;');
  });

  it('chỉ biến thể warning dùng tiêu đề 16.875px/25.313px; hộp xóa nhóm (Figma 563:2) giữ 18.75px/28px', () => {
    const warning = declarationsOf(css, '.warningDialog h2');
    const base = declarationsOf(css, '.confirmationDialog h2');

    expect(warning).toContain('font-size: 16.875px;');
    expect(warning).toContain('line-height: 25.313px;');
    expect(base).toContain('font-size: 18.75px;');
    expect(base).toContain('line-height: 28px;');
  });
});

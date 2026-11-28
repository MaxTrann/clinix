import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ArticleApiContext } from '../api/article-api-context';
import { makeManyPublished } from '../testing/article-fixtures';
import { createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';
import {
  ARTICLE_GRID,
  BUTTON_SECONDARY_CLASS,
  CHIP_OFF,
  CHIP_ON,
  HOME_GRID,
  PUBLIC_CONTAINER,
  TEXT_LINK_CLASS,
} from './article-public-styles';
import { HomeHandbookSection } from './home-handbook-section';

// article F2, ABG-11: khoá TÊN LỚP và cấu trúc của bố cục (lưới một cột ở màn hẹp, không tràn ngang, chip xuống dòng, vùng bấm tối thiểu 44 px). Mức W (`css: false`): test không đo bố cục;
// đo thật ở 375 px và 125 phần trăm là việc của X1 (ABK-03). Lưu ý gốc `html` là 15 px nên `min-h-11` chỉ ra 41,25 px: dùng `min-h-[44px]`.
const SOURCES = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const classes = (element: Element) => element.className.split(/\s+/u);

describe('khung và lưới (ABG-11)', () => {
  it('ABG-11 hằng khung: 1200 px đệm 30 px (cùng giá trị khung công khai của search, khai lại trong module)', () => {
    expect(PUBLIC_CONTAINER).toBe('mx-auto max-w-320 px-8');
    expect(ARTICLE_GRID).toBe(
      'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3',
    );
    expect(HOME_GRID).toBe(
      'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4',
    );
  });

  it('ABG-11 trang danh sách: <main> dùng khung rộng; lưới thẻ MỘT cột ở màn hẹp, hai ở sm, ba ở lg', async () => {
    renderPublicPages({ api: createFakeArticleApi(makeManyPublished(12)) });
    await screen.findAllByRole('heading', { level: 2 });

    expect(classes(screen.getByRole('main'))).toEqual(
      expect.arrayContaining(['mx-auto', 'max-w-320', 'px-8']),
    );
    const grid = screen.getAllByRole('heading', { level: 2 })[0].closest('ul')!;
    expect(classes(grid)).toEqual(
      expect.arrayContaining([
        'grid',
        'grid-cols-1',
        'sm:grid-cols-2',
        'lg:grid-cols-3',
      ]),
    );
    // KHÔNG có cột cố định ở màn hẹp (sẽ tràn ngang ở 375 px)
    expect(classes(grid)).not.toContain('grid-cols-2');
    expect(classes(grid)).not.toContain('grid-cols-3');
  });

  it('ABG-11 khối trang chủ: một cột ở màn hẹp, hai ở sm, bốn ở lg; khung rộng', async () => {
    render(
      <ArticleApiContext.Provider
        value={createFakeArticleApi(makeManyPublished(4))}
      >
        <MemoryRouter>
          <HomeHandbookSection />
        </MemoryRouter>
      </ArticleApiContext.Provider>,
    );
    const region = await screen.findByRole('region', {
      name: 'Cẩm nang sức khỏe',
    });
    const grid = within(region)
      .getAllByRole('heading', { level: 3 })[0]
      .closest('ul')!;

    expect(classes(grid)).toEqual(
      expect.arrayContaining([
        'grid-cols-1',
        'sm:grid-cols-2',
        'lg:grid-cols-4',
      ]),
    );
    expect(classes(grid)).not.toContain('grid-cols-4');
    expect(classes(region.firstElementChild!)).toEqual(
      expect.arrayContaining(['mx-auto', 'max-w-320', 'px-8']),
    );
  });

  it('ABG-11 thẻ bài: cả thẻ là vùng bấm (liên kết kéo giãn phủ thẻ), chữ dài không tràn (cắt hai dòng)', async () => {
    renderPublicPages({ api: createFakeArticleApi(makeManyPublished(2)) });
    const [heading] = await screen.findAllByRole('heading', { level: 2 });
    const card = heading.closest('li')!;
    const link = within(card).getByRole('link');

    expect(classes(card)).toContain('relative');
    expect(classes(link)).toEqual(
      expect.arrayContaining([
        'after:absolute',
        'after:inset-0',
        'line-clamp-2',
      ]),
    );
  });
});

describe('chip và vùng bấm (ABG-11)', () => {
  it('ABG-11 chip thẻ xuống dòng (flex-wrap) và mỗi chip cao tối thiểu 44 px', async () => {
    const api = createFakeArticleApi(
      makeManyPublished(3).map((article) => ({
        ...article,
        hashtag: ['a', 'b', 'c'],
      })),
    );
    renderPublicPages({ api });
    const group = await screen.findByRole('group', { name: 'Lọc theo thẻ' });

    expect(classes(group)).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap']),
    );
    const chips = within(group).getAllByRole('button');
    expect(chips).toHaveLength(3);
    for (const chip of chips) expect(classes(chip)).toContain('min-h-[44px]');
    expect(CHIP_ON).toContain('min-h-[44px]');
    expect(CHIP_OFF).toContain('min-h-[44px]');
  });

  it('ABG-11 nút phân trang và liên kết chữ có vùng bấm 44 px; ô tìm cao 48 (h-12 = 45 px ở gốc 15 px)', async () => {
    renderPublicPages({ api: createFakeArticleApi(makeManyPublished(12)) });
    await screen.findAllByRole('heading', { level: 2 });

    for (const name of ['Trang trước', 'Trang sau']) {
      const button = screen.getByRole('button', { name });
      expect(classes(button)).toEqual(
        expect.arrayContaining(['min-h-[44px]', 'min-w-[44px]']),
      );
    }
    expect(BUTTON_SECONDARY_CLASS).toContain('min-h-[44px]');
    expect(TEXT_LINK_CLASS).toContain('min-h-[44px]');
    expect(classes(screen.getByRole('searchbox'))).toContain('h-12');
  });
});

describe('quét mã: lớp quy đổi sai gốc 16 px (ABG-11)', () => {
  // Cùng danh sách của `features/search/layout.test.ts` (UIS-01) cộng `min-h-11`/`min-w-11` (41,25 px: dưới cỡ chạm 44 px)
  const MISCONVERTED =
    /(?<![\w-])(?:max-w-300|px-7\.5|h-15|size-7\.5|size-4\.5|py-11|gap-7\.5|mt-7\.5|pt-5\.5|min-h-11|min-w-11)(?![\w.-])/;

  // Bỏ chú thích trước khi quét (câu giải thích có thể nhắc đúng lớp bị cấm)
  const strip = (source: string) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('ABG-11 không file mã nào của `public/` viết lớp theo gốc 16 px hay `min-h-11`', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, code]) => MISCONVERTED.test(strip(code)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('ABG-11 bộ quét bỏ chú thích: câu giải thích nhắc `min-h-11` không bị báo, mã thật dùng `min-h-11` thì bị báo (đối chứng)', () => {
    expect(MISCONVERTED.test(strip('// min-h-11 chỉ được 41,25 px'))).toBe(
      false,
    );
    expect(MISCONVERTED.test(strip('/* min-h-11 */ const a = 1;'))).toBe(false);
    expect(MISCONVERTED.test(strip('const c = "min-h-11 flex";'))).toBe(true);
  });

  it('ABG-11 bộ quét có tác dụng: thấy file mã thật và BẮT mẫu xấu, không báo nhầm mẫu lành (đối chứng)', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining(['./article-list-page.tsx', './article-card.tsx']),
    );
    for (const bad of ['min-h-11', 'px-7.5', 'max-w-300', 'a min-w-11 b']) {
      expect(MISCONVERTED.test(bad)).toBe(true);
    }
    for (const good of [
      'min-h-[44px]',
      'min-h-110',
      'xmin-h-11',
      'max-w-320',
      'px-8',
    ]) {
      expect(MISCONVERTED.test(good)).toBe(false);
    }
  });

  it('ABG-11 mọi liên kết và nút trong thẻ bài dùng lớp vùng bấm hay là liên kết kéo giãn (không chip nhỏ lẻ)', () => {
    const card = SOURCES['./article-card.tsx'];
    expect(card).toContain('after:absolute after:inset-0');
  });
});

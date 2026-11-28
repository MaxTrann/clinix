import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { ArticleApiContext } from '../api/article-api-context';
import { makeDetail } from '../testing/article-fixtures';
import {
  createFakeArticleApi,
  type FakeArticleApi,
} from '../testing/fake-article-api';
import { HashtagInput } from './hashtag-input';

// article F1, ABW-04: ô thẻ (Enter, dấu phẩy, gợi ý có debounce, chọn gợi ý, bỏ chip, quá 10). Chuẩn hoá đúng như máy chủ (`hashtag-name.ts`). Bản giả; dữ liệu giả.
const ten = (count: number) =>
  Array.from({ length: count }, (_, index) => `the-${index}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Harness({
  initial = [],
  error,
  api = createFakeArticleApi(),
}: {
  initial?: string[];
  error?: string;
  api?: FakeArticleApi;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <ArticleApiContext.Provider value={api}>
      <HashtagInput value={tags} onChange={setTags} error={error} />
      <output data-testid="tags">{tags.join('|')}</output>
    </ArticleApiContext.Provider>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Thẻ' });
const tags = () => screen.getByTestId('tags').textContent;
// Gõ thật: ô phải đang có tiêu điểm thì danh sách gợi ý mới mở
const type = (value: string) => {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value } });
};
const enter = () => fireEvent.keyDown(input(), { key: 'Enter' });
const chipButtons = () => screen.queryAllByRole('button', { name: /^Bỏ thẻ / });

describe('ô thẻ: thêm chip (ABW-04)', () => {
  it('ABW-04 Enter thêm chip đã chuẩn hoá ("  #Trẻ Em " ⇒ "#trẻ-em"), xoá ô; Enter KHÔNG gửi biểu mẫu (đã chặn mặc định)', () => {
    render(<Harness />);

    type('  #Trẻ Em ');
    const notPrevented = fireEvent.keyDown(input(), { key: 'Enter' });

    expect(notPrevented).toBe(false);
    expect(tags()).toBe('trẻ-em');
    expect(screen.getByText('#trẻ-em')).toBeVisible();
    expect(input()).toHaveValue('');
  });

  it('ABW-04 Enter ở ô trống không thêm gì nhưng vẫn không gửi biểu mẫu', () => {
    render(<Harness />);

    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false);
    expect(tags()).toBe('');
  });

  it('ABW-04 dấu phẩy thêm chip: "abc," ⇒ chip abc, ô trống; dán "a, B ,c" ⇒ chip a và b, chữ "c" còn ở ô', () => {
    render(<Harness />);

    type('abc,');
    expect(tags()).toBe('abc');
    expect(input()).toHaveValue('');

    type('a, B ,c');
    expect(tags()).toBe('abc|a|b');
    expect(input()).toHaveValue('c');
  });

  it('ABW-04 thẻ trùng (sau chuẩn hoá) bị bỏ im lặng, không lỗi', () => {
    render(<Harness initial={['trẻ-em']} />);

    type('#TRẺ  em');
    enter();

    expect(tags()).toBe('trẻ-em');
    expect(input()).toHaveValue('');
    expect(screen.queryByText(/Thẻ chỉ gồm/)).toBeNull();
  });

  it('ABW-04 thẻ sai ký tự ⇒ báo lỗi dưới ô, giữ chữ để sửa, ô đánh dấu aria-invalid; gõ tiếp thì hết báo', () => {
    render(<Harness />);

    type('a b!');
    enter();

    expect(tags()).toBe('');
    expect(input()).toHaveValue('a b!');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText(
        'Thẻ chỉ gồm chữ, số và dấu gạch ngang (tối đa 50 ký tự).',
      ),
    ).toBeVisible();
    type('a b');
    expect(screen.queryByText(/Thẻ chỉ gồm/)).toBeNull();
    expect(input()).not.toHaveAttribute('aria-invalid');
  });

  it('ABW-04 dán nhiều thẻ có một thẻ sai ⇒ các thẻ trước đó được thêm, dừng ở thẻ sai, chữ còn lại giữ ở ô', () => {
    render(<Harness />);

    type('a, b!, c,');

    expect(tags()).toBe('a');
    expect(input()).toHaveValue('b!,c');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });

  it('ABW-04 tối đa 10 thẻ: thẻ thứ 11 bị chặn kèm câu; bộ đếm "10 / 10 thẻ"; thẻ trùng khi đã đủ vẫn không lỗi', () => {
    render(<Harness initial={ten(10)} />);
    expect(screen.getByText('10 / 10 thẻ')).toBeVisible();

    type('moi');
    enter();
    expect(tags()).toBe(ten(10).join('|'));
    expect(screen.getByText('Tối đa 10 thẻ mỗi bài.')).toBeVisible();
    expect(input()).toHaveValue('moi');

    type('the-3');
    enter();
    expect(screen.queryByText('Tối đa 10 thẻ mỗi bài.')).toBeNull();
    expect(tags()).toBe(ten(10).join('|'));
  });

  it('ABW-04 rời ô khi còn chữ dở ⇒ chữ được thêm thành chip (khỏi mất khi bấm Lưu)', () => {
    render(<Harness />);

    type('Moi');
    fireEvent.blur(input());

    expect(tags()).toBe('moi');
    expect(input()).toHaveValue('');
  });

  it('ABW-04 lỗi từ máy chủ (prop error) hiện dưới ô Thẻ, ô aria-invalid', () => {
    render(<Harness error="Đã có thẻ “mặt” (khác dấu). Hãy dùng thẻ này." />);

    expect(
      screen.getByText('Đã có thẻ “mặt” (khác dấu). Hãy dùng thẻ này.'),
    ).toBeVisible();
    expect(input()).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ô thẻ: bỏ chip (ABW-04, ABW-11)', () => {
  it('ABW-04 bấm "Bỏ thẻ x" bỏ đúng chip đó, KHÔNG xoá thẻ khác; focus về ô nhập', () => {
    render(<Harness initial={['a', 'b', 'c']} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thẻ b' }));

    expect(tags()).toBe('a|c');
    expect(
      chipButtons().map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Bỏ thẻ a', 'Bỏ thẻ c']);
    expect(input()).toHaveFocus();
    expect(screen.getByText('2 / 10 thẻ')).toBeVisible();
  });

  it('ABW-04 bỏ bớt chip khi đã đủ 10 thì thêm lại được và hết báo "Tối đa"', () => {
    render(<Harness initial={ten(10)} />);
    type('moi');
    enter();
    expect(screen.getByText('Tối đa 10 thẻ mỗi bài.')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thẻ the-0' }));
    expect(screen.queryByText('Tối đa 10 thẻ mỗi bài.')).toBeNull();
    enter();
    expect(tags()).toContain('moi');
  });
});

describe('ô thẻ: gợi ý (ABW-04)', () => {
  const withTags = () =>
    createFakeArticleApi([
      makeDetail({
        baiVietId: '1',
        hashtag: ['trẻ-em', 'trẻ-sơ-sinh', 'tim-mạch'],
      }),
    ]);
  const suggestionCalls = (api: FakeArticleApi) =>
    api.callsTo('suggestTags').map((call) => call.args[0]);

  it('ABW-04 gõ không gọi ngay; sau 250 ms yên gọi MỘT lần với tiền tố đã chuẩn hoá; gõ liên tiếp chỉ gọi một lần', async () => {
    const api = withTags();
    render(<Harness api={api} />);

    type('T');
    type('Tr');
    type('Trẻ');
    expect(api.callsTo('suggestTags')).toHaveLength(0);

    await waitFor(() => expect(api.callsTo('suggestTags')).toHaveLength(1));
    expect(suggestionCalls(api)).toEqual(['trẻ']);
    await sleep(350);
    expect(api.callsTo('suggestTags')).toHaveLength(1);
    const list = await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['#trẻ-em', '#trẻ-sơ-sinh']);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });

  it('ABW-04 gõ KHÔNG dấu ("tre") vẫn thấy gợi ý có dấu ("trẻ-em"): tin máy chủ (khớp theo collation không phân biệt dấu), không lọc lại bằng startsWith thường', async () => {
    const api = withTags();
    render(<Harness api={api} />);

    type('tre');

    const list = await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });
    expect(api.callsTo('suggestTags').map((call) => call.args[0])).toEqual([
      'tre',
    ]);
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['#trẻ-em', '#trẻ-sơ-sinh']);
  });

  it('ABW-04 chọn gợi ý bằng chuột ⇒ thêm chip, xoá ô; gợi ý không hiện lại thẻ đã chọn', async () => {
    const api = withTags();
    render(<Harness api={api} />);
    type('tr');
    const option = await screen.findByRole('option', { name: '#trẻ-em' });

    fireEvent.mouseDown(option);

    expect(tags()).toBe('trẻ-em');
    expect(input()).toHaveValue('');
    type('trẻ');
    const list = await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((item) => item.textContent),
    ).toEqual(['#trẻ-sơ-sinh']);
  });

  it('ABW-04 ↓ ↑ chọn gợi ý, Enter thêm gợi ý đang chọn (không thêm chữ đang gõ); aria-activedescendant theo gợi ý đang chọn', async () => {
    const api = withTags();
    render(<Harness api={api} />);
    type('tr');
    await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });

    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    const first = screen.getByRole('option', { name: '#trẻ-em' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', first.id);
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(
      screen.getByRole('option', { name: '#trẻ-sơ-sinh' }),
    ).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    expect(first).toHaveAttribute('aria-selected', 'true');
    enter();

    expect(tags()).toBe('trẻ-em');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ABW-04 Esc đóng danh sách gợi ý, chữ đang gõ giữ nguyên', async () => {
    render(<Harness api={withTags()} />);
    type('tr');
    await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input()).toHaveValue('tr');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
  });

  it('ABW-04 xoá hết chữ ⇒ danh sách gợi ý biến mất ngay (không chờ debounce)', async () => {
    render(<Harness api={withTags()} />);
    type('tr');
    await screen.findByRole('listbox', { name: 'Gợi ý thẻ' });

    type('');

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ABW-04 gợi ý hỏng (lỗi máy chủ) KHÔNG chặn nhập thẻ: không danh sách, vẫn Enter thêm được', async () => {
    const api = withTags();
    api.failNext(
      'suggestTags',
      new ApiError(500, { maLoi: 'LOI_HE_THONG', thongBao: 'x' }),
    );
    render(<Harness api={api} />);

    type('moi');
    await waitFor(() => expect(api.callsTo('suggestTags')).toHaveLength(1));
    await sleep(50);
    expect(screen.queryByRole('listbox')).toBeNull();
    enter();

    expect(tags()).toBe('moi');
  });

  it('ABW-04 chữ không hợp lệ (không chuẩn hoá được) thì không gọi gợi ý', async () => {
    const api = withTags();
    render(<Harness api={api} />);

    type('a!');
    await sleep(350);

    expect(api.callsTo('suggestTags')).toHaveLength(0);
  });
});

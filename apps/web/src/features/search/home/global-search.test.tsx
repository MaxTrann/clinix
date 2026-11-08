import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import * as api from '../api/search-service';
import type { PublicSuggestions } from '../api/search-types';
import { NetworkError, TimeoutError } from '../../../shared/api/errors';
import { GlobalSearch } from './global-search';

vi.mock('../api/search-service');

const suggestions: PublicSuggestions = {
  chuyenKhoa: [{ chuyenKhoaId: '1', ten: 'Tim mạch' }],
  dichVu: [{ dichVuKhamId: '2', ten: 'Khám tim' }],
  bacSi: [{ bacSiId: '3', hoTen: 'Bác sĩ mẫu', chucDanh: 'BS_CKII' }],
};
const empty: PublicSuggestions = { chuyenKhoa: [], dichVu: [], bacSi: [] };

function Destination() {
  const location = useLocation();
  return <p data-testid="destination">{location.pathname + location.search}</p>;
}

function openSearch() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <GlobalSearch />
              <button>Ra ngoài</button>
            </>
          }
        />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}

function typeQuery(value = 'tim') {
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

async function advance(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.mocked(api.getSuggestions).mockResolvedValue(suggestions);
});

afterEach(() => {
  vi.useRealTimers();
});

it('TCH-05: gõ nhanh chỉ gọi sau 300 ms, trim từ khoá; combobox có listbox và nhãn ba loại', async () => {
  openSearch();
  const input = typeQuery('t');
  await advance(200);
  typeQuery('  tim  ');
  await advance(299);
  expect(api.getSuggestions).not.toHaveBeenCalled();
  expect(screen.getByRole('status')).toHaveTextContent('Đang tìm');
  await advance(1);
  expect(api.getSuggestions).toHaveBeenCalledExactlyOnceWith(
    'tim',
    expect.any(AbortSignal),
  );
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(input).toHaveAttribute(
    'aria-controls',
    screen.getByRole('listbox').id,
  );
  expect(screen.getAllByRole('option')).toHaveLength(3);
  for (const name of ['Chuyên khoa', 'Dịch vụ khám', 'Bác sĩ']) {
    expect(screen.getByRole('group', { name })).toBeInTheDocument();
  }
  expect(screen.getByText('BS.CKII Bác sĩ mẫu')).toBeInTheDocument();
});

it('TCH-05: đổi từ khoá huỷ ngay request đang chạy, bỏ response cũ dù về muộn', async () => {
  let finishOld!: (value: PublicSuggestions) => void;
  vi.mocked(api.getSuggestions).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  openSearch();
  typeQuery();
  await advance();
  const signal = vi.mocked(api.getSuggestions).mock.calls[0][1];
  typeQuery('nhi');
  expect(signal?.aborted).toBe(true);
  vi.mocked(api.getSuggestions).mockResolvedValue(empty);
  await advance();
  await act(async () => {
    finishOld(suggestions);
  });
  expect(screen.queryByRole('option')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Không tìm thấy kết quả phù hợp',
  );
});

it('TCH-05 / TCH-04: rỗng hoặc chỉ khoảng trắng không gọi API; xoá từ khoá huỷ request và ẩn hộp', async () => {
  const view = openSearch();
  const input = typeQuery('   ');
  await advance();
  expect(api.getSuggestions).not.toHaveBeenCalled();
  expect(input).toHaveAttribute('maxLength', '100');
  typeQuery();
  await advance();
  const signal = vi.mocked(api.getSuggestions).mock.calls[0][1];
  typeQuery('');
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('listbox')).toBeNull();
  view.unmount();
});

it('TCH-05: lên/xuống/Enter chọn gợi ý qua aria-activedescendant; Escape đóng, không xoá từ khoá', async () => {
  openSearch();
  const input = typeQuery();
  await advance();
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(screen.getAllByRole('option')[2]).toHaveAttribute(
    'aria-selected',
    'true',
  );
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const option = screen.getAllByRole('option')[0];
  expect(input).toHaveAttribute('aria-activedescendant', option.id);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('tim');
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(input).not.toHaveAttribute('aria-activedescendant');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  await advance();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByTestId('destination')).toHaveTextContent('/chuyen-khoa/1');
});

it.each([
  ['Tim mạch', '/chuyen-khoa/1'],
  ['Khám tim', '/bac-si?dichVuKhamId=2'],
  ['BS.CKII Bác sĩ mẫu', '/bac-si/3'],
])('TCH-05 / Q20: bấm %s mở đúng %s', async (name, path) => {
  openSearch();
  typeQuery();
  await advance();
  fireEvent.click(screen.getByRole('option', { name: new RegExp(name) }));
  expect(screen.getByTestId('destination')).toHaveTextContent(path);
});

it('TCH-05 / Q20: submit chưa chọn gợi ý tìm bác sĩ bằng từ khoá đã trim và encode', () => {
  openSearch();
  typeQuery('  tim & mạch  ');
  fireEvent.submit(screen.getByRole('search'));
  expect(screen.getByTestId('destination')).toHaveTextContent(
    '/bac-si?q=tim+%26+m%E1%BA%A1ch',
  );
});

it('TCH-05: Enter trong lúc nhập dấu không chọn gợi ý', async () => {
  openSearch();
  const input = typeQuery();
  await advance();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  expect(screen.queryByTestId('destination')).toBeNull();
});

it.each([new NetworkError(), new TimeoutError()])(
  'TCH-05 / TBS-22: lỗi mạng/timeout có thông báo và thử lại giữ từ khoá',
  async (error) => {
    vi.mocked(api.getSuggestions).mockRejectedValueOnce(error);
    openSearch();
    const input = typeQuery();
    await advance();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await advance();
    expect(input).toHaveValue('tim');
    expect(screen.getAllByRole('option')).toHaveLength(3);
  },
);

it('TCH-05: blur ra ngoài đóng hộp/huỷ request; unmount huỷ request kế tiếp', async () => {
  vi.mocked(api.getSuggestions).mockReturnValue(new Promise(() => {}));
  const view = openSearch();
  const input = typeQuery();
  await advance();
  const firstSignal = vi.mocked(api.getSuggestions).mock.calls[0][1];
  fireEvent.blur(input, {
    relatedTarget: screen.getByRole('button', { name: 'Ra ngoài' }),
  });
  expect(firstSignal?.aborted).toBe(true);
  expect(input).toHaveAttribute('aria-expanded', 'false');
  fireEvent.focus(input);
  await advance();
  const nextSignal = vi.mocked(api.getSuggestions).mock.calls[1][1];
  view.unmount();
  expect(nextSignal?.aborted).toBe(true);
});

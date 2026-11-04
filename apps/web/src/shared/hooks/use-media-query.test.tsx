import { act, render, screen } from '@testing-library/react';
import { fakeMatchMedia } from '../../test/fake-match-media';
import { useMediaQuery } from './use-media-query';

// patient F11 (TRACKING F11-G). Mã ca MQ-nn là [đề xuất]; hook là phần "JS quyết định hẹp/rộng" của KG-08.
function Probe({ query = '(min-width: 1024px)' }: { query?: string }) {
  const wide = useMediaQuery(query);
  return <p>{wide ? 'rộng' : 'hẹp'}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('MQ-01 KG-08 trả kết quả ban đầu của truy vấn, đúng ngưỡng 1024px', () => {
  fakeMatchMedia(1023);
  const { unmount } = render(<Probe />);
  expect(screen.getByText('hẹp')).toBeInTheDocument();
  unmount();
  fakeMatchMedia(1024);
  render(<Probe />);
  expect(screen.getByText('rộng')).toBeInTheDocument();
});

it('MQ-02 KG-08 đổi theo sự kiện change khi kéo cửa sổ qua ngưỡng', () => {
  const media = fakeMatchMedia(1440);
  render(<Probe />);
  act(() => media.resize(390));
  expect(screen.getByText('hẹp')).toBeInTheDocument();
  act(() => media.resize(1024));
  expect(screen.getByText('rộng')).toBeInTheDocument();
});

it('MQ-03 gỡ component thì gỡ bộ nghe', () => {
  const media = fakeMatchMedia(1440);
  const { unmount } = render(<Probe />);
  expect(media.listenerCount()).toBe(1);
  unmount();
  expect(media.listenerCount()).toBe(0);
});

it('MQ-04 đổi truy vấn khi render lại: nghe truy vấn mới, bỏ nghe truy vấn cũ', () => {
  const media = fakeMatchMedia(800);
  const { rerender } = render(<Probe query="(min-width: 1024px)" />);
  expect(screen.getByText('hẹp')).toBeInTheDocument();
  rerender(<Probe query="(min-width: 768px)" />);
  expect(screen.getByText('rộng')).toBeInTheDocument();
  expect(media.listenerCount()).toBe(1);
  // 800 ⇒ 700 chỉ đổi kết quả của truy vấn mới; còn nghe truy vấn cũ thì không có `change` nào
  act(() => media.resize(700));
  expect(screen.getByText('hẹp')).toBeInTheDocument();
});

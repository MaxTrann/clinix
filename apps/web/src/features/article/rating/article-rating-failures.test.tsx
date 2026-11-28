import { act, fireEvent, screen, within } from '@testing-library/react';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  NetworkError,
  RequestAbortedError,
  TimeoutError,
} from '../../../shared/api/errors';
import { PUBLIC_TEXT } from '../public/article-public-text';
import { makePublished } from '../testing/article-fixtures';
import { apiError, createFakeArticleApi } from '../testing/fake-article-api';
import { renderPublicPages } from '../testing/render-public-pages';
import {
  findEnabledButton,
  resetSession,
  signIn,
  signOutAsGuest,
} from '../testing/rating-session';
import { RATING_TEXT } from './rating-text';

// article F3: lỗi, bấm đúp và bấm liên tiếp. ABU-04: bấm đúp ⇒ MỘT lời gọi; lỗi mạng, hết giờ, 5xx ⇒ giữ trạng thái cũ và báo cạnh nút; 404 ⇒ câu A2.
// ABU-06: bấm liên tiếp ⇒ kết quả cũ không đè mới. Cách dung hoà (kế hoạch (d)): khoá cả khối trong lúc gửi (chốt `useRef` single-flight), nên KHÔNG BAO GIỜ có hai lời gọi ghi cùng bay.
// Ca giữ lời gọi bằng `hold` rồi mới thả (không dựa vào thời gian); ca bấm đúp đặt cả hai lần bấm trong MỘT `act` để chỉ chốt `useRef` (không phải state vẽ lại) mới chặn được.
const PATH = '/cam-nang/12-sot-xuat-huyet';
const GROUP = 'Bài viết có ích không?';
const UNAVAILABLE = 'Bài viết không còn tồn tại hoặc đã được gỡ.';
const PATIENT = 'bn-1';

function setup() {
  const api = createFakeArticleApi([
    makePublished({
      baiVietId: '12',
      tieuDe: 'Sốt xuất huyết',
      noiDung: 'Diệt muỗi.',
    }),
    makePublished({
      baiVietId: '13',
      tieuDe: 'Bài mười ba',
      noiDung: 'Bài khác.',
    }),
  ]);
  api.seedRatings('12', { thich: 5, khongThich: 2 });
  api.seedRatings('13', { thich: 1 });
  signIn(api, 'BenhNhan', PATIENT);
  return api;
}

const group = () => screen.getByRole('group', { name: GROUP });
const alertIn = () => within(group()).getByRole('alert');

beforeEach(() => resetSession());

describe('khối đánh giá: bấm đúp (ABU-04)', () => {
  it('ABU-04 hai lần bấm trong MỘT nhịp ⇒ đúng MỘT lời gọi (chốt useRef, không phải state vẽ lại)', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    const gate = api.hold('setRating');

    act(() => {
      fireEvent.click(like);
      fireEvent.click(like);
    });

    expect(api.callsTo('setRating')).toHaveLength(1);
    gate.release();
    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    expect(api.callsTo('setRating')).toHaveLength(1);
    expect(api.callsTo('clearRating')).toHaveLength(0);
    expect(api.ratingRows('12')).toBe(8);
  });

  it('ABU-04 hai lần bấm trong một nhịp ở nút ĐANG CHỌN ⇒ đúng MỘT DELETE', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (6)', true);
    const gate = api.hold('clearRating');

    act(() => {
      fireEvent.click(like);
      fireEvent.click(like);
    });

    expect(api.callsTo('clearRating')).toHaveLength(1);
    gate.release();
    await screen.findByRole('button', { name: 'Thích (5)', pressed: false });
    expect(api.callsTo('clearRating')).toHaveLength(1);
  });

  it('ABU-04 đối chứng: bấm lần hai SAU khi lần một xong thì gửi được (chốt đã nhả đúng)', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });

    fireEvent.click(await findEnabledButton('Thích (5)'));
    fireEvent.click(await findEnabledButton('Thích (6)', true));

    await screen.findByRole('button', { name: 'Thích (5)', pressed: false });
    expect(api.callsTo('setRating')).toHaveLength(1);
    expect(api.callsTo('clearRating')).toHaveLength(1);
  });

  it('ABU-04 trong lúc gửi: nhóm aria-busy, hai nút aria-disabled, nút đang giữ tiêu điểm vẫn giữ tiêu điểm', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    const gate = api.hold('setRating');
    like.focus();

    fireEvent.click(like);

    expect(group()).toHaveAttribute('aria-busy', 'true');
    expect(like).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('button', { name: 'Không thích (2)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(like);

    gate.release();
    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    expect(group()).toHaveAttribute('aria-busy', 'false');
    expect(like).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('khối đánh giá: lỗi ở lời gọi ghi (ABU-04)', () => {
  it.each([
    ['mất mạng', () => new NetworkError(), NETWORK_ERROR_MESSAGE],
    ['hết giờ', () => new TimeoutError(), TIMEOUT_ERROR_MESSAGE],
    ['5xx', () => apiError(500, 'LOI_HE_THONG'), GENERIC_ERROR_MESSAGE],
  ])(
    'ABU-04 PUT gặp %s ⇒ giữ trạng thái cũ (nút, số đếm), báo ngay cạnh nút; bấm lại thì gửi được và lỗi biến mất',
    async (_name, makeError, message) => {
      const api = setup();
      renderPublicPages({ api, path: PATH });
      const like = await findEnabledButton('Thích (5)');
      api.failNext('setRating', makeError());

      fireEvent.click(like);

      expect(await within(group()).findByRole('alert')).toHaveTextContent(
        message,
      );
      expect(
        screen.getByRole('button', { name: 'Thích (5)', pressed: false }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
      ).toBeInTheDocument();
      expect(api.ratingRows('12')).toBe(7);

      // Chốt đã nhả sau lỗi: bấm lại gửi được
      fireEvent.click(await findEnabledButton('Thích (5)'));
      await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
      expect(within(group()).queryByRole('alert')).toBeNull();
      expect(api.callsTo('setRating')).toHaveLength(2);
    },
  );

  it('ABU-04 DELETE gặp lỗi ⇒ vẫn "đang chọn" và số đếm cũ (không tự thu hồi trên màn hình)', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (6)', true);
    api.failNext('clearRating', new NetworkError());

    fireEvent.click(like);

    expect(await within(group()).findByRole('alert')).toHaveTextContent(
      NETWORK_ERROR_MESSAGE,
    );
    expect(
      screen.getByRole('button', { name: 'Thích (6)', pressed: true }),
    ).toBeInTheDocument();
    expect(api.ratingOf('12', PATIENT)).toBe('Thich');
  });

  it('ABU-04 đổi loại gặp lỗi ⇒ vẫn ở loại cũ', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const dislike = await findEnabledButton('Không thích (2)', false);
    api.failNext('setRating', new TimeoutError());

    fireEvent.click(dislike);

    await within(group()).findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Thích (6)', pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
    ).toBeInTheDocument();
  });

  it('ABU-04 bài đã bị ẩn khi bấm (máy chủ 404 thật của bản giả) ⇒ "Bài viết không còn tồn tại hoặc đã được gỡ." cạnh nút, giữ trạng thái, KHÔNG thay cả trang', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    await api.update('12', { trangThai: 'LuuTruAn' });

    fireEvent.click(like);

    expect(await within(group()).findByRole('alert')).toHaveTextContent(
      UNAVAILABLE,
    );
    expect(
      screen.getByRole('button', { name: 'Thích (5)', pressed: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
    expect(api.ratingRows('12')).toBe(7);
  });

  it('ABU-04 DELETE gặp 404 ⇒ cùng câu; nút vẫn "đang chọn"', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (6)', true);
    api.failNext('clearRating', apiError(404, 'KHONG_TIM_THAY'));

    fireEvent.click(like);

    expect(await within(group()).findByRole('alert')).toHaveTextContent(
      UNAVAILABLE,
    );
    expect(
      screen.getByRole('button', { name: 'Thích (6)', pressed: true }),
    ).toBeInTheDocument();
  });

  it('ABU-04 câu 404 chọn theo MÃ lỗi, không theo mã HTTP: 404 với mã lạ ⇒ câu lỗi chung, không phải câu "không còn tồn tại"', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    api.failNext('setRating', apiError(404, 'MA_LA'));

    fireEvent.click(like);

    expect(await within(group()).findByRole('alert')).toHaveTextContent(
      GENERIC_ERROR_MESSAGE,
    );
    expect(alertIn()).not.toHaveTextContent(UNAVAILABLE);
  });

  it('ABU-04 hai chữ 404 của trang và của khối khớp nhau (khối không import public/ nên lặp một câu)', () => {
    expect(RATING_TEXT.unavailable).toBe(PUBLIC_TEXT.unavailable);
    expect(RATING_TEXT.unavailable).toBe(UNAVAILABLE);
  });

  it('ABU-04 lời gọi bị huỷ (RequestAbortedError) không phải lỗi để báo; chốt vẫn nhả', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    api.failNext('setRating', new RequestAbortedError());

    fireEvent.click(like);
    await act(async () => {});

    expect(within(group()).queryByRole('alert')).toBeNull();
    fireEvent.click(await findEnabledButton('Thích (5)'));
    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
  });

  it('ABU-11 (mức bản giả) 401 giữa chừng: trang không trắng; khi phiên đổi sang khách thì khối tự chuyển chế độ và không còn báo lỗi', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    api.failNext('setRating', apiError(401, 'PHIEN_HET_HIEU_LUC'));

    fireEvent.click(like);
    await within(group()).findByRole('alert');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();

    // Đúng điều lớp auth làm khi làm mới thất bại: phiên về `unauthenticated`
    act(() => signOutAsGuest(api));

    expect(within(group()).queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thích (5)' }));
    expect(
      screen.getByRole('link', { name: 'Đăng nhập để đánh giá' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sốt xuất huyết' }),
    ).toBeInTheDocument();
  });
});

describe('khối đánh giá: lỗi ở lúc tải phiếu của mình', () => {
  it('ABU-04 GET gặp lỗi mạng ⇒ khối lỗi kèm "Thử lại", nút bị khoá (không đoán phiếu); bấm "Thử lại" tải lại rồi dùng được', async () => {
    const api = setup();
    api.failNext('getMyRating', new NetworkError());
    renderPublicPages({ api, path: PATH });

    const alert = await within(
      await screen.findByRole('group', { name: GROUP }),
    ).findByRole('alert');
    expect(alert).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(group()).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('button', { name: 'Thích (5)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Bấm nút khi chưa biết phiếu ⇒ không gửi gì
    fireEvent.click(screen.getByRole('button', { name: 'Thích (5)' }));
    expect(api.callsTo('setRating')).toHaveLength(0);

    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));

    await findEnabledButton('Thích (5)');
    expect(api.callsTo('getMyRating')).toHaveLength(2);
    expect(within(group()).queryByRole('alert')).toBeNull();
  });

  it('ABU-04 GET gặp 404 (bài bị ẩn giữa lúc mở trang và lúc tải phiếu) ⇒ câu "không còn tồn tại", không có "Thử lại", nút khoá', async () => {
    const api = setup();
    api.failNext('getMyRating', apiError(404, 'KHONG_TIM_THAY'));
    renderPublicPages({ api, path: PATH });

    const alert = await within(
      await screen.findByRole('group', { name: GROUP }),
    ).findByRole('alert');
    expect(alert).toHaveTextContent(UNAVAILABLE);
    expect(within(alert).queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thích (5)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('khối đánh giá: bấm liên tiếp (ABU-06)', () => {
  it('ABU-06 trong lúc PUT Thích còn đang gửi, bấm Không thích ⇒ vẫn MỘT lời gọi; thả ra thì màn hình là kết quả của lời gọi đã gửi (cũ không bị đè); rồi bấm lại mới có lời gọi thứ hai', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    const dislike = screen.getByRole('button', { name: 'Không thích (2)' });
    const gate = api.hold('setRating');

    fireEvent.click(like);
    expect(api.callsTo('setRating')).toHaveLength(1);
    fireEvent.click(dislike);
    expect(api.callsTo('setRating')).toHaveLength(1);
    expect(api.callsTo('clearRating')).toHaveLength(0);

    gate.release();
    await screen.findByRole('button', { name: 'Thích (6)', pressed: true });
    expect(
      screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
    ).toBeInTheDocument();
    expect(api.ratingOf('12', PATIENT)).toBe('Thich');

    // Sau khi xong thì bấm nút kia gửi được và màn hình theo lời gọi MỚI
    fireEvent.click(await findEnabledButton('Không thích (2)', false));
    await screen.findByRole('button', {
      name: 'Không thích (3)',
      pressed: true,
    });
    expect(
      screen.getByRole('button', { name: 'Thích (5)', pressed: false }),
    ).toBeInTheDocument();
    expect(api.callsTo('setRating').map((call) => call.args)).toEqual([
      ['12', 'Thich'],
      ['12', 'KhongThich'],
    ]);
  });

  it('ABU-06 bấm Không thích TRONG LÚC DELETE đang gửi ⇒ bị bỏ; kết quả cuối là của DELETE', async () => {
    const api = setup();
    api.seedRating('12', PATIENT, 'Thich');
    renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (6)', true);
    const dislike = screen.getByRole('button', { name: 'Không thích (2)' });
    const gate = api.hold('clearRating');

    fireEvent.click(like);
    fireEvent.click(dislike);
    expect(api.callsTo('setRating')).toHaveLength(0);

    gate.release();
    await screen.findByRole('button', { name: 'Thích (5)', pressed: false });
    expect(api.callsTo('clearRating')).toHaveLength(1);
    expect(api.callsTo('setRating')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Không thích (2)', pressed: false }),
    ).toBeInTheDocument();
  });

  it('ABU-06 lời gọi thất bại rồi bấm nút kia ngay sau đó: kết quả của lần sau được dùng, lỗi cũ không còn', async () => {
    const api = setup();
    renderPublicPages({ api, path: PATH });
    api.failNext('setRating', new NetworkError());
    fireEvent.click(await findEnabledButton('Thích (5)'));
    await within(group()).findByRole('alert');

    fireEvent.click(await findEnabledButton('Không thích (2)', false));

    await screen.findByRole('button', {
      name: 'Không thích (3)',
      pressed: true,
    });
    expect(within(group()).queryByRole('alert')).toBeNull();
  });

  it('ABU-06 sang bài khác khi lời gọi của bài cũ còn treo ⇒ kết quả muộn của bài cũ không hiện ở bài mới', async () => {
    const api = setup();
    const { router } = renderPublicPages({ api, path: PATH });
    const like = await findEnabledButton('Thích (5)');
    const gate = api.hold('setRating');
    fireEvent.click(like);
    expect(api.callsTo('setRating')).toHaveLength(1);

    await act(async () => {
      await router.navigate('/cam-nang/13-bai-muoi-ba');
    });
    await screen.findByRole('heading', { level: 1, name: 'Bài mười ba' });
    const likeOfNew = await findEnabledButton('Thích (1)', false);

    gate.release();
    await act(async () => {});

    // Bài 13 vẫn là số và phiếu của chính nó
    expect(likeOfNew).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: 'Không thích (0)', pressed: false }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thích (6)' })).toBeNull();
    expect(api.ratingOf('13', PATIENT)).toBeNull();
  });
});

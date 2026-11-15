import { Link } from 'react-router';
import { PUBLIC_CONTAINER } from '../layout';
import { BOOKING_PATH } from '../search-paths';

const STEPS = [
  {
    icon: 'step-service',
    title: 'Chọn dịch vụ khám',
    text: 'Chọn nhóm dịch vụ, rồi dịch vụ hoặc chuyên khoa phù hợp.',
  },
  {
    icon: 'step-doctor',
    title: 'Chọn bác sĩ và khung giờ',
    text: 'Xem lịch còn trống và chọn khung giờ thuận tiện.',
  },
  {
    icon: 'step-payment',
    title: 'Xác nhận và đặt cọc',
    text: 'Khoản cọc (nếu có) được trừ từ ví CLINIX.',
  },
  // Q21: bỏ số phút minh hoạ của Figma; chưa có API cấu hình công khai để đọc thời hạn.
  {
    icon: 'step-hold',
    title: 'Giữ chỗ',
    text: 'Khung giờ chỉ được giữ khi bạn vào màn thanh toán.',
  },
];

export function HomeProcess() {
  return (
    <section aria-labelledby="home-process" className="bg-brand-soft py-14">
      <div className={PUBLIC_CONTAINER}>
        <h2
          id="home-process"
          className="text-center text-3xl font-bold text-gray-900"
        >
          Đặt lịch khám tại CLINIX
        </h2>
        <p className="mt-1.5 text-center text-gray-600">
          Quy trình rõ ràng, bạn luôn biết bước tiếp theo
        </p>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.icon}
              className="rounded-2xl border border-gray-200 bg-white p-5"
            >
              <div className="flex items-center gap-3">
                {/* Figma bo 13,375 px (`radius + 4px`), còn `rounded-xl` của Tailwind là 11,25 px nên ghi số px thật. */}
                <span className="flex size-10 items-center justify-center rounded-[13.375px] bg-brand-strong">
                  <img
                    src={`/assets/search/home/${step.icon}.svg`}
                    alt=""
                    aria-hidden="true"
                  />
                </span>
                <span className="text-xs font-semibold text-brand-strong">
                  Bước {index + 1}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-gray-900">
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link
            to={BOOKING_PATH}
            className="inline-flex items-center gap-2 rounded-[13.375px] bg-brand-strong px-8 py-3 font-medium text-white"
          >
            <img
              src="/assets/search/home/calendar.svg"
              alt=""
              aria-hidden="true"
            />
            Đặt lịch khám
          </Link>
        </div>
      </div>
    </section>
  );
}

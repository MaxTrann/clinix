import { useState, type ReactNode } from 'react';
import type { ExamRating } from '../api/patient-exam-types';
import { ExamRecordSection } from './exam-record-section';
import { RatingSection, type RatingNotice } from './rating-section';
import { useExamDetail } from './use-exam-detail';

// Hai thẻ cắm vào trang chi tiết lịch hẹn của Bệnh nhân (doctor-exam F6; PLAN 5.13; Q20, Q21): `record` ở cột TRÁI, `rating` ở cột PHẢI (Figma `422:2` đến `425:2`). Cả hai là `null` khi lịch chưa `HoanThanh`: nơi gọi giữ thẻ chữ tĩnh cũ.
export interface PatientExamCards {
  record: ReactNode;
  rating: ReactNode;
}

export interface PatientExamSectionsProps {
  maLichHen: string;
  // Trạng thái lịch hẹn hiện tại (kiểu `string`: không import kiểu của booking, Q20). CHỈ `HoanThanh` gọi API và dựng hai thẻ (WXH-09, WDG-01)
  trangThai: string;
  // Dựng cả lưới hai cột từ hai thẻ (render-prop): hai thẻ nằm ở hai cột khác nhau của booking mà chung MỘT lần gọi API
  children: (cards: PatientExamCards) => ReactNode;
}

const COMPLETED_STATE = 'HoanThanh';

// Kết quả của lần gửi gần nhất, gắn với MÃ LỊCH HẸN của nó: đổi `maLichHen` mà thành phần không bị gỡ thì kết quả cũ KHÔNG sang lịch mới (WDG-18)
interface Outcome {
  maLichHen: string;
  kind: RatingNotice;
  // Đánh giá vừa gửi (thân 201); `null` ở `already` (đánh giá của máy chủ sẽ về khi tải lại)
  rating: ExamRating | null;
}

// Hồ sơ khám và đánh giá của MỘT lịch `HoanThanh` (doctor-exam F6; WXH-09, WDG-04, WDG-05, WDG-18). Gọi MỘT lần `GET /patient/exam-records/<mã>` (`useExamDetail`, Q21) và chia cho hai thẻ; lịch chưa `HoanThanh` KHÔNG có lời gọi nào.
// Lỗi gọi chỉ hỏng hai thẻ này (có `Thử lại`), trang chi tiết booking không bị kéo theo. Sau khi gửi thành công dùng THÂN 201 để hiện "đã đánh giá" ngay (không tải lại). 409 `DA_DANH_GIA` thì tải lại để hiện đánh giá của máy chủ
// (cả hai thẻ qua "đang tải" ngắn: `useRemote` không giữ dữ liệu cũ, `TECH_DEBT` 168 (a)). Thẻ đánh giá có `key` theo mã lịch hẹn nên đổi lịch hẹn là gỡ luôn form đang mở.
export function PatientExamSections({
  maLichHen,
  trangThai,
  children,
}: PatientExamSectionsProps) {
  const enabled = trangThai === COMPLETED_STATE;
  const { state, retry } = useExamDetail(enabled ? maLichHen : null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (!enabled) return <>{children({ record: null, rating: null })}</>;

  const current = outcome?.maLichHen === maLichHen ? outcome : null;
  return (
    <>
      {children({
        record: <ExamRecordSection state={state} onRetry={retry} />,
        rating: (
          <RatingSection
            key={maLichHen}
            state={state}
            maLichHen={maLichHen}
            rated={current?.rating ?? null}
            notice={current?.kind ?? null}
            onRated={(rating) =>
              setOutcome({ maLichHen, kind: 'sent', rating })
            }
            onAlreadyRated={() => {
              setOutcome({ maLichHen, kind: 'already', rating: null });
              retry();
            }}
            onRetry={retry}
          />
        ),
      })}
    </>
  );
}

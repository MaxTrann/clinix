// Bề mặt công khai của phần khám bệnh (doctor-exam, phần web): `features/doctor/index.ts` xuất lại từ đây; `features/booking` chỉ được import qua `features/doctor/index.ts` (Q20).
export { ExamHeaderActions } from './doctor/complete-action';
export type { ExamHeaderActionsProps } from './doctor/complete-action';
export { ExamRecordCard } from './doctor/exam-record-card';
export type {
  ExamRecordCardProps,
  ExamRecordNote,
} from './doctor/exam-record-card';
export { PATIENT_EXAM_RECORDS_PATH } from './patient/patient-exam-paths';
export { PATIENT_EXAM_ROUTES } from './patient/patient-exam-routes';

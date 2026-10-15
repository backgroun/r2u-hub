import { notFound } from "next/navigation";
import Demo from "./demo";

/* 로컬 전용 미리보기: 로그인 없이 러너 10종이 실제처럼 차례대로 뛰어가는 모습을 본다 (배포 환경에서는 열리지 않는다) */
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Demo />;
}

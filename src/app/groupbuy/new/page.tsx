import { currentUser } from "@/lib/hub";
import NewRoundForm from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewRound() {
  const u = await currentUser();
  // 공구 오픈자 칸에 로그인한 닉네임을 미리 채운다 (관리용 ‘운영진’ 계정은 제외)
  return <NewRoundForm me={u && u.nick !== "운영진" ? u.nick : ""} />;
}

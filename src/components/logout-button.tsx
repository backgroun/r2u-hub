import { logout } from "@/app/actions";

/** 로그아웃 버튼 (내 페이지·운영진 ‘내 계정’에 둔다) */
export default function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="btn w-full">로그아웃</button>
    </form>
  );
}

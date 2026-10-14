"use client";

export default function NicknameEditButton({ kind = "nick" }: { kind?: "nick" | "name" }) {
  return (
    <button
      type="button"
      className="btn btn-ghost text-sm py-1 px-2"
      onClick={() => {
        const section = document.getElementById(kind === "nick" ? "nickname-change" : "name-change") as HTMLDetailsElement | null;
        if (!section) return;
        section.open = true;
        section.scrollIntoView({ behavior: "smooth", block: "nearest" });
        section.querySelector<HTMLInputElement>(kind === "nick" ? 'input[name="newNick"]' : 'input[name="name"]')?.focus({ preventScroll: true });
      }}
    >{kind === "nick" ? "닉네임 수정" : "이름 수정"}</button>
  );
}

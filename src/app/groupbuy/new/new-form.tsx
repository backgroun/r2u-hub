"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RoundForm, { EMPTY_DRAFT, type DesignImage, type RoundDraft } from "@/components/round-form";

type FailedImages = { design?: { slot: number; img: DesignImage }[]; size?: DesignImage };
import { api, MY_ROUNDS, store, type MyRound } from "@/lib/client";
import { makeTitle } from "@/lib/types";

type CopyOf = { id: string; round: Pick<RoundDraft, "bank" | "pickup" | "minQty" | "items" | "custom"> };

// 이미지는 공구가 만들어진 뒤에 올린다. 한 번 더 시도하고, 그래도 안 되면 알려 준다.
async function putImage(id: string, key: string, kind: "design" | "size", img: DesignImage, slot = 0) {
  for (let i = 0; i < 2; i++) {
    try { await api(`/api/rounds/${id}/image`, { method: "PUT", json: { key, kind, slot, ...img } }); return true; } catch { /* 한 번 더 */ }
  }
  return false;
}

export default function NewRoundForm({ me, copyOf }: { me: string; copyOf?: CopyOf }) {
  const router = useRouter();
  const initial: RoundDraft = copyOf
    ? { ...EMPTY_DRAFT, ...copyOf.round, opener: me, title: "", deadline: EMPTY_DRAFT.deadline } // 마감일은 새로 정한다
    : { ...EMPTY_DRAFT, opener: me };
  return (
    <main className="wrap grid gap-5">
      <Link href="/groupbuy" className="text-sm text-muted">← 처음으로</Link>
      <h1 className="hub-h1">{copyOf ? "공구 복사해서 열기" : "새 공구 열기"}</h1>
      {copyOf && <p className="panel p-3.5 text-sm text-muted">지난 공구의 계좌·배포 장소·상품 정보를 가져왔어요. <b>마감 날짜</b>를 새로 정하고 필요한 부분만 고쳐서 열어 주세요. (주문 내용은 가져오지 않아요)</p>}
      <RoundForm
        initial={initial}
        roundId={copyOf?.id}
        draftKey={`crew-gb:draft:new:${me || "guest"}${copyOf ? `:copy:${copyOf.id}` : ""}`}
        submitLabel="공구 열기"
        onSubmit={async (d, password, extra) => {
          // 복사한 공구의 이미지를 그대로 쓰면(keep) 서버가 원본에서 복사해 온다
          const copyImages = copyOf ? { from: copyOf.id, design: extra.design.keep, size: extra.sizeImage === "keep" } : undefined;
          const { id, adminKey } = await api<{ id: string; adminKey: string }>("/api/rounds", { method: "POST", json: { ...d, password, notifyOpen: extra.notifyOpen, ...(copyImages ? { copyImages } : {}) } });
          const failed: FailedImages = {};
          for (const a of extra.design.add) {
            if (!(await putImage(id, adminKey, "design", a.img, a.slot))) (failed.design ??= []).push(a);
          }
          if (extra.sizeImage && extra.sizeImage !== "keep" && !(await putImage(id, adminKey, "size", extra.sizeImage))) failed.size = extra.sizeImage;
          // 올리지 못한 이미지는 관리 화면에서 다시 올릴 수 있게 이 탭에 남겨 둔다
          if (failed.design?.length || failed.size) { try { sessionStorage.setItem(`crew-gb:pending-img:${id}`, JSON.stringify(failed)); } catch { /* 저장 못 하면 관리 화면에서 직접 올린다 */ } }
          const mine = store.get<MyRound[]>(MY_ROUNDS, []);
          store.set(MY_ROUNDS, [{ id, key: adminKey, title: makeTitle(d.opener, d.items) }, ...mine]);
          router.push(`/groupbuy/r/${id}/manage?new=1`);
        }}
      />
    </main>
  );
}

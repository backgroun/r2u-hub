import type { Result } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";

export default function SheetSync({ title, help, url, action, button }: { title: string; help: string; url: string; action: (s: Result, fd: FormData) => Promise<Result>; button: string }) {
  return (
    <details className="sheet-sync-panel">
      <summary className="btn btn-primary">{button}</summary>
      <ActionForm action={action} className="panel p-4 grid gap-3 mt-2" keep>
        <h2 className="font-bold">{title}</h2>
        <p className="text-sm text-muted">{help}</p>
        <label className="field">
          <span className="label">시트 탭 주소 (해당 탭을 연 상태의 주소)</span>
          <input name="url" type="url" className="input" required defaultValue={url} />
        </label>
        <div className="flex gap-2 flex-wrap items-center">
          <Submit>동기화 실행</Submit>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--lane)]">시트 열기 ↗</a>
        </div>
      </ActionForm>
    </details>
  );
}


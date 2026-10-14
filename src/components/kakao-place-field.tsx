"use client";

import { useEffect, useId, useRef, useState } from "react";

type Place = { id: string; name: string; address: string; url: string };

export default function KakaoPlaceField({ label = "장소", placeholder, place = "", address = "", placeUrl = "" }: {
  label?: string; placeholder?: string; place?: string; address?: string; placeUrl?: string;
}) {
  const [query, setQuery] = useState(place === "미정" ? "" : place);
  const [undecided, setUndecided] = useState(place === "미정");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState({ address, url: placeUrl });
  const [results, setResults] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => { setQuery(place === "미정" ? "" : place); setUndecided(place === "미정"); setSelected({ address, url: placeUrl }); setResults([]); setTouched(false); setError(""); setSearched(false); setActive(-1); };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [place, address, placeUrl]);
  useEffect(() => {
    if (undecided || !touched || query.trim().length < 2 || selected.address || selected.url) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: abort.signal });
        const data = await response.json() as { places?: Place[]; error?: string };
        if (!abort.signal.aborted) { setResults(data.places ?? []); setError(data.error ?? ""); setSearched(true); setActive(-1); }
      } catch { if (!abort.signal.aborted) setError("장소 검색을 불러오지 못했어요."); }
      finally { if (!abort.signal.aborted) setSearching(false); }
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query, selected.address, selected.url, touched, undecided]);
  const choose = (item: Place) => {
    setQuery(item.name); setSelected({ address: item.address, url: item.url });
    setResults([]); setTouched(false); setError(""); setActive(-1);
  };
  return (
    <div className="field kakao-place-field" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) { setResults([]); setTouched(false); setActive(-1); }
    }}>
      <div className="flex items-center justify-between gap-2">
        <label className="label" htmlFor={id}>{label}</label>
        <label className="text-xs text-muted inline-flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={undecided} onChange={(e) => {
          setUndecided(e.target.checked); setSelected({ address: "", url: "" }); setResults([]); setTouched(false); setError(""); setSearching(false); setSearched(false); setActive(-1);
        }} /> 미정</label>
      </div>
      <div className="kakao-place-input-wrap">
        <input ref={inputRef} id={id} className="input" value={undecided ? "" : query} disabled={undecided} maxLength={60} placeholder={undecided ? "미정" : placeholder || "장소 이름 검색"} autoComplete="off"
          role="combobox" aria-autocomplete="list" aria-expanded={!undecided && results.length > 0} aria-controls={!undecided && results.length ? `${id}-results` : undefined}
          aria-activedescendant={active >= 0 ? `${id}-result-${active}` : undefined}
          onFocus={() => setTouched(true)} onChange={(e) => {
            setQuery(e.target.value); setTouched(true); setSelected({ address: "", url: "" });
            setResults([]); setError(""); setSearched(false); setActive(-1);
          }} onKeyDown={(e) => {
            if (e.key === "ArrowDown" && results.length) { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
            if (e.key === "ArrowUp" && results.length) { e.preventDefault(); setActive((i) => (i <= 0 ? results.length - 1 : i - 1)); }
            if (e.key === "Enter" && results.length) { e.preventDefault(); choose(results[active >= 0 ? active : 0]); }
            if (e.key === "Escape") { setResults([]); setTouched(false); setActive(-1); }
          }} />
        {!undecided && <span className="kakao-place-search-icon" aria-hidden>⌕</span>}
        {!undecided && results.length > 0 && <div id={`${id}-results`} className="kakao-place-results" role="listbox" aria-label="카카오 장소 검색 결과">
          {results.map((item, index) => <button key={item.id} id={`${id}-result-${index}`} type="button" role="option" aria-selected={active === index}
            onMouseEnter={() => setActive(index)} onClick={() => choose(item)}><b>{item.name}</b><span>{item.address}</span></button>)}
        </div>}
      </div>
      <input type="hidden" name="place" value={undecided ? "미정" : query} />
      <input type="hidden" name="address" value={undecided ? "" : selected.address} />
      <input type="hidden" name="placeUrl" value={undecided ? "" : selected.url} />
      {!undecided && searching && <p className="text-xs text-muted">카카오 지도에서 검색 중…</p>}
      {!undecided && error && <p className="text-xs text-muted">{error} 장소를 직접 입력할 수도 있어요.</p>}
      {!undecided && touched && searched && !searching && !error && results.length === 0 && query.trim().length >= 2 && !selected.url && <p className="text-xs text-muted">검색 결과가 없어요. 장소 이름을 직접 입력할 수 있어요.</p>}
    </div>
  );
}

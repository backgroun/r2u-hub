"use client";

import type { InputHTMLAttributes } from "react";

export const normalizePassword = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

export default function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      onInput={(event) => {
        const input = event.currentTarget;
        const before = input.value;
        const cursor = input.selectionStart;
        const normalized = normalizePassword(before);
        if (before !== normalized) {
          input.value = normalized;
          if (cursor !== null) {
            const nextCursor = normalizePassword(before.slice(0, cursor)).length;
            input.setSelectionRange(nextCursor, nextCursor);
          }
        }
        props.onInput?.(event);
      }}
    />
  );
}

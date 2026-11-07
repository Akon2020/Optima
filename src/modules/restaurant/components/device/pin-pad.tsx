"use client";

import { Delete } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/shared/lib/cn";
import { PIN_LENGTH } from "@/offline/pin";

/**
 * Pavé numérique du code PIN : grandes touches (au moins 44 px), saisie
 * aussi possible au clavier physique.
 */
export function PinPad({
  value,
  onChange,
  onComplete,
  label,
  disabled = false,
  hasError = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  label: string;
  disabled?: boolean;
  hasError?: boolean;
}) {
  function press(digit: string) {
    if (disabled || value.length >= PIN_LENGTH) return;
    const next = value + digit;
    onChange(next);
    if (next.length === PIN_LENGTH) onComplete(next);
  }

  function erase() {
    if (!disabled) onChange(value.slice(0, -1));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") erase();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        role="status"
        aria-label={`${label} : ${value.length} chiffre(s) sur ${PIN_LENGTH}`}
        className="flex gap-4"
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn(
              "size-4 rounded-full border-2 transition-colors duration-150",
              hasError
                ? "border-danger bg-danger"
                : index < value.length
                  ? "border-action bg-action"
                  : "border-border-strong",
            )}
          />
        ))}
      </div>
      <div className="grid w-full max-w-[280px] grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <PadKey key={digit} label={digit} onClick={() => press(digit)} disabled={disabled} />
        ))}
        <span aria-hidden />
        <PadKey label="0" onClick={() => press("0")} disabled={disabled} />
        <button
          type="button"
          onClick={erase}
          disabled={disabled || value.length === 0}
          aria-label="Effacer le dernier chiffre"
          className="grid h-16 place-items-center rounded-card text-text-muted transition-colors hover:bg-bg-subtle disabled:opacity-40"
        >
          <Delete aria-hidden className="size-6" />
        </button>
      </div>
    </div>
  );
}

function PadKey({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-16 rounded-card bg-surface text-2xl font-medium shadow-card transition-colors tabular hover:bg-bg-subtle active:bg-bg-subtle disabled:opacity-40"
    >
      {label}
    </button>
  );
}

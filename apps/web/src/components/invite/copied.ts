import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "@/lib/context-menu";
import { useToast } from "@/lib/toast";

/** How long a button says "Copiado" before it reads as itself again. */
const COPIED_MS = 1800;

/**
 * Copies a text and remembers which button did it (`key`) for a moment: that button says "Copiado" with a check,
 * then goes back. `said`: a toast once it's on the clipboard, for what the button has no room to say.
 */
export function useCopied() {
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    (key: string, text: string, said?: string) => {
      void copyText(text, () => {
        if (timer.current) clearTimeout(timer.current);
        setCopied(key);
        timer.current = setTimeout(() => setCopied(null), COPIED_MS);
        if (said) toast.show(said);
      });
    },
    [toast],
  );
  return [copied, copy] as const;
}

"use client";
import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** Caja de texto sin tirador que crece con lo que se escribe, hasta el max-height del CSS. */
export default function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

import type { ReactNode } from "react";
import Reveal from "./Reveal";
import { badge, type TintColor } from "../lib/ui";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  accent?: TintColor;
  action?: ReactNode;
  children: ReactNode;
};

export default function Section({ id, eyebrow, title, accent = "yellow", action, children }: SectionProps) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-7 sm:py-16">
      <Reveal>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div>
            {eyebrow ? <span className={`${badge(accent)} mb-3 uppercase tracking-[0.14em]`}>{eyebrow}</span> : null}
            <h2 className="max-w-2xl text-2xl font-bold leading-[1.15] tracking-tight sm:text-[2.25rem]">{title}</h2>
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
        {children}
      </Reveal>
    </section>
  );
}

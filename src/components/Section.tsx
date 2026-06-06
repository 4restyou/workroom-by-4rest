import type { ReactNode } from "react";

type SectionProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
};

export default function Section({ id, eyebrow, title, children }: SectionProps) {
  return (
    <section id={id} className="mx-auto max-w-5xl px-4 py-7 sm:py-10">
      <div className="mb-5">
        {eyebrow ? <p className="mb-2 text-xs font-bold uppercase text-workroom-muted">{eyebrow}</p> : null}
        <h2 className="max-w-2xl text-3xl font-black leading-tight sm:text-4xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

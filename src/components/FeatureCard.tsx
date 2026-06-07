type FeatureCardProps = {
  title: string;
  body: string;
  mark: string;
};

export default function FeatureCard({ title, body, mark }: FeatureCardProps) {
  return (
    <article className="rounded-card border border-workroom-line bg-workroom-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-sketch">
      <div className="mb-5 grid h-10 w-10 place-items-center rounded-full bg-workroom-mint text-base font-black">
        {mark}
      </div>
      <h3 className="text-lg font-black">{title}</h3>
      <p className="mt-3 text-sm font-medium leading-6 text-workroom-muted">{body}</p>
    </article>
  );
}

type FeatureCardProps = {
  title: string;
  body: string;
  mark: string;
};

export default function FeatureCard({ title, body, mark }: FeatureCardProps) {
  return (
    <article className="rounded-card border-2 border-workroom-line bg-workroom-surface p-5 shadow-sketch">
      <div className="mb-5 grid h-11 w-11 place-items-center rounded-full border-2 border-workroom-line bg-workroom-purple text-xl font-black">
        {mark}
      </div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 text-sm font-semibold leading-6 text-workroom-muted">{body}</p>
    </article>
  );
}

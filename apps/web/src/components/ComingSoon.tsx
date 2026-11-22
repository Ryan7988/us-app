import { PageHeader } from "./PageHeader";

export function ComingSoon({
  title,
  emoji,
  items,
}: {
  title: string;
  emoji: string;
  items: string[];
}) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card py-10 text-center">
        <div className="mb-3 text-5xl">{emoji}</div>
        <p className="font-semibold">施工中，敬請期待</p>
        <ul className="mt-4 space-y-1 text-sm text-stone-500">
          {items.map((i) => (
            <li key={i}>・{i}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

import { toBlocks } from "@/domain/help/articles";

/** A help article's text: paragraphs, lists and headings only (never HTML). */
export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="space-y-4 text-lg leading-relaxed">
      {toBlocks(body).map((b, i) =>
        b.type === "h" ? (
          <h2 key={i} className="pt-2 text-2xl font-semibold">
            {b.text}
          </h2>
        ) : b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-6">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}

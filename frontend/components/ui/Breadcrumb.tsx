import Link from 'next/link';

/**
 * Trail back out of a product page. A link to where you already are is noise
 * for anyone navigating by keyboard, so the last crumb is plain text.
 *
 * aria-current keys off being last, NOT off having no href: intermediate
 * crumbs can also be unlinked (a category with no route of its own), and
 * marking those as the current page would announce two current locations.
 */
export default function Breadcrumb({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
        {items.map((item, i) => {
          const isCurrent = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-gray-400">
                  /
                </span>
              )}
              {item.href && !isCurrent ? (
                <Link href={item.href} className="hover:text-gray-900 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? 'page' : undefined}
                  className={isCurrent ? 'text-gray-900' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

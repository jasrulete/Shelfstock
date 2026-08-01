import Card from './ui/Card';

/**
 * Buying questions, answered.
 *
 * Every answer here describes something the system actually does - COD is the
 * only payment path, stock really is decremented under a row lock at checkout,
 * and order_items.price_at_purchase really does freeze the price. There is
 * deliberately no returns or delivery-window entry, because nothing in the
 * codebase implements either and a storefront that invents policy is worse
 * than one that stays quiet about it.
 *
 * Native <details> rather than a JS accordion: it is keyboard operable and
 * findable by in-page search with no client code at all.
 */
const FAQS = [
  {
    q: 'How do I pay for this order?',
    a: 'Cash on delivery. You pay the courier when the parcel reaches you, so no card or e-wallet is needed to order. Nothing is charged when you place the order.',
  },
  {
    q: 'Is the stock count on this page real?',
    a: 'Yes. It is the live figure and drops the moment someone checks out. If two people reach for the last unit at the same time, only one order goes through — the other is told before it is placed, not after.',
  },
  {
    q: 'Can the price change before my order arrives?',
    a: 'No. The price is recorded against your order the moment you place it. If this product gets more expensive tomorrow, your order keeps the price you saw today.',
  },
  {
    q: 'Why does the total say USD when I picked pesos?',
    a: 'Prices are held in USD and converted for display, so the peso figure is an approximate guide at the current rate. The amount recorded against your order is the USD one, which is why both are shown.',
  },
];

export default function ProductFaq() {
  return (
    <section className="mt-10 space-y-3">
      <h2 className="text-lg font-semibold">Before you buy</h2>
      <Card className="divide-y divide-gray-200">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group p-4">
            <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium marker:content-none">
              {faq.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-gray-400 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2 max-w-[65ch] text-sm text-gray-600">{faq.a}</p>
          </details>
        ))}
      </Card>
    </section>
  );
}

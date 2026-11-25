import type { DashboardData } from "./api.js";

export function MarketFreshness({ items }: { items: DashboardData["priceFreshness"] }) {
  return (
    <section className="market-freshness panel" aria-label="Market data freshness">
      <strong>Market data freshness</strong>
      {items.length ? (
        <div>
          {items.map((item) => (
            <span key={item.id}>
              {item.name} ·{" "}
              {item.source === "AMFI"
                ? "Closing NAV"
                : item.source === "PROVIDER"
                  ? "Provider quote"
                  : item.source === "MANUAL"
                    ? "Manual"
                    : "No price"}{" "}
              · {item.date ?? "no date"}
              {item.stale ? " · stale" : ""}
            </span>
          ))}
        </div>
      ) : (
        <span>No market prices recorded.</span>
      )}
    </section>
  );
}

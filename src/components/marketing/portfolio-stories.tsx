import { PORTFOLIO_STORIES } from "@/lib/marketing-stories";
import { Icon3D } from "./icon-3d";

export function PortfolioStories({ limit = PORTFOLIO_STORIES.length }: { limit?: number }) {
  return (
    <div className="fy-sales-cards">
      {PORTFOLIO_STORIES.slice(0, limit).map((s, i) => (
        <article className="fy-sales-card" key={s.title}>
          <Icon3D name={s.icon} size={56} />
          <span className="fy-sales-eyebrow">
            Sprawa {String(i + 1).padStart(2, "0")} · zamknięta
          </span>
          <h3>{s.title}</h3>
          <div className="fy-sales-story-numbers">
            <strong>{s.amount}</strong>
            <span>{s.outcome}</span>
          </div>
          <p>{s.text}</p>
        </article>
      ))}
    </div>
  );
}

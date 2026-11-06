import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CosmosTriangulationPanel } from "./CosmosTriangulationPanel";
import { parseCosmosFeed } from "../features/cosmos/domain/client-state";

describe("Cosmos geometry display", () => {
  it("shows zero coordinates and residuals as provisional geometry without artificial certainty", () => {
    const { events } = parseCosmosFeed({
      observations: [],
      events: [
        {
          id: "event-1",
          title: "Deux observations",
          phenomenon_type: "meteor",
          description: null,
          observation_count: 2,
          status: "unverified",
          event_at: "2026-11-06T12:00:00Z",
          triangulation: {
            estimated_latitude: 0,
            estimated_longitude: 0,
            estimated_altitude_km: 0,
            residual_rms_km: 0,
            observer_count: 2,
            baseline_km: 20,
            time_span_seconds: 0,
            confidence: 0.95,
          },
        },
      ],
    });
    const html = renderToStaticMarkup(createElement(CosmosTriangulationPanel, { events }));
    expect(html).toContain("0.000°");
    expect(html).toContain("0.0 km");
    expect(html).toContain("0.00 km");
    expect(html).toContain("Estimation géométrique");
    expect(html).toContain("À vérifier");
    expect(html).not.toContain("95%");
    expect(html).not.toContain("±");
  });

  it("explains the real two-observer prerequisite when no solution is available", () => {
    const html = renderToStaticMarkup(createElement(CosmosTriangulationPanel, { events: [] }));
    expect(html).toContain("deux observateurs indépendants");
    expect(html).not.toContain("3 observateurs");
  });
});

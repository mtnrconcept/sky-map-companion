import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CosmosOperationsMap } from "@/components/CosmosOperationsMap";
import { CosmosTriangulationScene } from "@/components/CosmosTriangulationScene";
import type { CosmosEvent, CosmosObservation } from "@/features/cosmos/domain/client-state";

const event: CosmosEvent = {
  id: "example-event",
  title: "Bolide test",
  description: null,
  phenomenon_type: "fireball",
  observation_count: 2,
  status: "provisional",
  event_at: "2026-11-08T12:01:00.000Z",
  triangulation: {
    estimated_latitude: 46.7,
    estimated_longitude: 7.8,
    estimated_altitude_km: 78,
    residual_rms_km: 3.2,
    max_residual_km: 4.2,
    observer_count: 2,
    baseline_km: 34,
    time_span_seconds: 8,
    method: "test",
  },
};
const observations: CosmosObservation[] = [
  {
    id: "test-one",
    latitude: 46.2,
    longitude: 6.1,
    phenomenon_type: "fireball",
    description: "First sighting",
    status: "analyzed",
    duration_s: null,
    magnitude: null,
    event_id: event.id,
    observed_at: "2026-11-08T12:01:00.000Z",
  },
  {
    id: "test-two",
    latitude: 46.4,
    longitude: 6.5,
    phenomenon_type: "fireball",
    description: "Second sighting",
    status: "analyzed",
    duration_s: null,
    magnitude: null,
    event_id: event.id,
    observed_at: "2026-11-08T12:01:08.000Z",
  },
];

describe("Cosmos mission-control visualisations", () => {
  it("renders a dark interactive map with OSM attribution and approximate observation positions", () => {
    const html = renderToStaticMarkup(
      <CosmosOperationsMap
        observations={observations}
        events={[event]}
        selectedEventId={event.id}
        selectedObservationId={observations[0]?.id ?? null}
        onSelectObservation={vi.fn()}
        userPosition={null}
        mode="network"
      />,
    );
    expect(html).toContain("OpenStreetMap");
    expect(html).toContain("Positions arrondies");
    expect(html).toContain("Liaisons indicatives");
    expect(html).toContain("First sighting");
    expect(html).toContain('role="group"');
  });

  it("never presents an unmeasured triangulation as a measured result", () => {
    const empty = renderToStaticMarkup(<CosmosTriangulationScene event={null} observations={[]} />);
    expect(empty).toContain("Aucune triangulation mesurée");
    expect(empty).not.toContain("Écart aux visées</dt><dd>3.2");
    expect(empty).toContain("Grille tridimensionnelle");
  });

  it("renders independent observer sites only for a real estimation", () => {
    const html = renderToStaticMarkup(
      <CosmosTriangulationScene event={event} observations={observations} />,
    );
    expect(html).toContain("Vue 3D indicative");
    expect(html).toContain("3.20 km");
    expect(html).toContain("34.0 km");
    expect(html).toContain("positions publiques");
    expect(html).toContain('aria-label="Agrandir la vue 3D"');
  });
});

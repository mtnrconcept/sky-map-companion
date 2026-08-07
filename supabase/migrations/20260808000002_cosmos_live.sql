-- ============================================================
-- COSMOS LIVE — Observatoire collaboratif en temps réel
-- ============================================================

-- Table des observations en temps réel soumises par les utilisateurs
CREATE TABLE public.cosmos_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  -- Géolocalisation de l'observateur
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  altitude_m double precision DEFAULT 0,
  -- Direction d'observation (azimut/élévation en degrés)
  azimuth double precision,
  elevation double precision,
  -- Catégorie du phénomène observé
  phenomenon_type text NOT NULL CHECK (phenomenon_type IN (
    'meteor', 'fireball', 'comet', 'supernova', 'aurora',
    'satellite', 'atmospheric', 'unknown'
  )),
  -- Description libre + métadonnées AI
  description text NOT NULL,
  image_url text,
  -- Durée estimée en secondes
  duration_s double precision,
  -- Magnitude estimée
  magnitude double precision,
  -- Score de confiance attribué par l'IA (0-1)
  ai_confidence double precision DEFAULT 0,
  ai_analysis jsonb,
  -- Statut de traitement
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'clustered', 'triangulated', 'published', 'rejected')),
  -- Référence à l'événement regroupé (si clustérisé)
  event_id uuid,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cosmos_obs_user ON public.cosmos_observations(user_id);
CREATE INDEX idx_cosmos_obs_type ON public.cosmos_observations(phenomenon_type);
CREATE INDEX idx_cosmos_obs_observed_at ON public.cosmos_observations(observed_at DESC);
CREATE INDEX idx_cosmos_obs_event ON public.cosmos_observations(event_id) WHERE event_id IS NOT NULL;
-- Index géographique via colonnes lat/lon
CREATE INDEX idx_cosmos_obs_geo ON public.cosmos_observations(latitude, longitude);

GRANT SELECT ON public.cosmos_observations TO authenticated, anon;
GRANT INSERT, UPDATE ON public.cosmos_observations TO authenticated;
GRANT ALL ON public.cosmos_observations TO service_role;

ALTER TABLE public.cosmos_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_obs" ON public.cosmos_observations FOR SELECT USING (true);
CREATE POLICY "users_insert_obs" ON public.cosmos_observations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_obs" ON public.cosmos_observations FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Table des événements regroupés (cluster d'observations)
-- Un événement = plusieurs observations du même phénomène
-- ============================================================
CREATE TABLE public.cosmos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phenomenon_type text NOT NULL,
  title text NOT NULL,
  description text,
  -- Nombre d'observations confirmantes
  observation_count integer DEFAULT 0,
  -- Étendue géographique (bounding box approximatif)
  min_latitude double precision,
  max_latitude double precision,
  min_longitude double precision,
  max_longitude double precision,
  -- Heure estimée du phénomène
  event_at timestamptz NOT NULL,
  -- Durée estimée en secondes
  estimated_duration_s double precision,
  -- Score de confiance global (0-1)
  confidence_score double precision DEFAULT 0,
  -- Statut scientifique
  status text DEFAULT 'unverified' CHECK (status IN ('unverified', 'confirmed', 'transmitted', 'rejected')),
  -- Analyse IA complète
  ai_analysis jsonb,
  -- Données de triangulation (si disponibles)
  triangulation jsonb,
  -- Transmis à un réseau scientifique citoyen
  transmitted_to text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cosmos_events_type ON public.cosmos_events(phenomenon_type);
CREATE INDEX idx_cosmos_events_at ON public.cosmos_events(event_at DESC);
CREATE INDEX idx_cosmos_events_status ON public.cosmos_events(status);

GRANT SELECT ON public.cosmos_events TO authenticated, anon;
GRANT ALL ON public.cosmos_events TO service_role;

ALTER TABLE public.cosmos_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_events" ON public.cosmos_events FOR SELECT USING (true);

-- ============================================================
-- Table des triangulations calculées
-- ============================================================
CREATE TABLE public.cosmos_triangulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.cosmos_events ON DELETE CASCADE,
  -- Observations utilisées pour la triangulation
  observation_ids uuid[] NOT NULL,
  -- Résultat : position estimée du phénomène
  estimated_latitude double precision,
  estimated_longitude double precision,
  -- Altitude estimée en km
  estimated_altitude_km double precision,
  -- Trajectoire (tableau de points lat/lon/alt)
  trajectory jsonb,
  -- Vitesse estimée en km/s
  estimated_speed_km_s double precision,
  -- Erreur marginale estimée en km
  error_margin_km double precision,
  -- Méthode de calcul
  method text DEFAULT 'geometric' CHECK (method IN ('geometric', 'ai_assisted', 'hybrid')),
  confidence double precision DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cosmos_tri_event ON public.cosmos_triangulations(event_id);

GRANT SELECT ON public.cosmos_triangulations TO authenticated, anon;
GRANT ALL ON public.cosmos_triangulations TO service_role;

ALTER TABLE public.cosmos_triangulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_triangulations" ON public.cosmos_triangulations FOR SELECT USING (true);

-- ============================================================
-- FK retardée : observations -> events
-- ============================================================
ALTER TABLE public.cosmos_observations
  ADD CONSTRAINT fk_obs_event
  FOREIGN KEY (event_id)
  REFERENCES public.cosmos_events(id)
  ON DELETE SET NULL;

-- ============================================================
-- Trigger : incrémente observation_count sur cosmos_events
-- ============================================================
CREATE OR REPLACE FUNCTION update_event_observation_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_id IS NOT NULL THEN
    UPDATE public.cosmos_events
      SET observation_count = observation_count + 1,
          updated_at = now()
      WHERE id = NEW.event_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    IF OLD.event_id IS NOT NULL THEN
      UPDATE public.cosmos_events
        SET observation_count = GREATEST(0, observation_count - 1),
            updated_at = now()
        WHERE id = OLD.event_id;
    END IF;
    IF NEW.event_id IS NOT NULL THEN
      UPDATE public.cosmos_events
        SET observation_count = observation_count + 1,
            updated_at = now()
        WHERE id = NEW.event_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_event_obs_count
AFTER INSERT OR UPDATE ON public.cosmos_observations
FOR EACH ROW EXECUTE FUNCTION update_event_observation_count();

-- ============================================================
-- RPC : observations récentes dans une zone géographique
-- ============================================================
CREATE OR REPLACE FUNCTION get_recent_observations(
  lat_center double precision,
  lon_center double precision,
  radius_deg double precision DEFAULT 30,
  since_minutes integer DEFAULT 60,
  limit_count integer DEFAULT 100
)
RETURNS SETOF public.cosmos_observations AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.cosmos_observations
  WHERE
    observed_at >= now() - (since_minutes || ' minutes')::interval
    AND latitude  BETWEEN lat_center  - radius_deg AND lat_center  + radius_deg
    AND longitude BETWEEN lon_center - radius_deg AND lon_center + radius_deg
  ORDER BY observed_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- RPC : événements actifs avec statistiques
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_events(since_hours integer DEFAULT 24)
RETURNS TABLE (
  id uuid,
  phenomenon_type text,
  title text,
  description text,
  observation_count integer,
  confidence_score double precision,
  status text,
  event_at timestamptz,
  triangulation jsonb,
  ai_analysis jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id, e.phenomenon_type, e.title, e.description,
    e.observation_count, e.confidence_score, e.status,
    e.event_at, e.triangulation, e.ai_analysis
  FROM public.cosmos_events e
  WHERE e.event_at >= now() - (since_hours || ' hours')::interval
    AND e.status != 'rejected'
  ORDER BY e.observation_count DESC, e.event_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

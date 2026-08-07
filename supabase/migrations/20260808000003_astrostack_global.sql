-- ============================================================
-- ASTROSTACK GLOBAL — Moteur de fusion astrophotographique mondial
-- ============================================================

-- Catalogue des objets célestes connus (M31, NGC 224, etc.)
CREATE TABLE public.astro_objects (
  id text PRIMARY KEY, -- "M31", "NGC224", "IC1805", etc.
  common_name text,
  type text NOT NULL CHECK (type IN (
    'galaxy','nebula','cluster_open','cluster_globular',
    'planetary_nebula','supernova_remnant','double_star',
    'asteroid','comet','planet','other'
  )),
  ra_deg double precision NOT NULL,  -- Right Ascension en degrés
  dec_deg double precision NOT NULL, -- Declination en degrés
  magnitude double precision,
  size_arcmin double precision,      -- Taille apparente en arcminutes
  description text,
  -- Stats agrégées mises à jour par triggers
  total_lights bigint DEFAULT 0,
  total_darks bigint DEFAULT 0,
  total_flats bigint DEFAULT 0,
  total_bias bigint DEFAULT 0,
  total_contributors integer DEFAULT 0,
  total_exposure_hours double precision DEFAULT 0,
  master_image_url text,
  master_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_astro_objects_type ON public.astro_objects(type);
CREATE INDEX idx_astro_objects_ra_dec ON public.astro_objects(ra_deg, dec_deg);

GRANT SELECT ON public.astro_objects TO authenticated, anon;
GRANT ALL ON public.astro_objects TO service_role;

ALTER TABLE public.astro_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_view_objects" ON public.astro_objects FOR SELECT USING (true);

-- ============================================================
-- Uploads de frames par les contributeurs
-- ============================================================
CREATE TABLE public.astro_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  object_id text REFERENCES public.astro_objects(id) ON DELETE SET NULL,
  -- Type de frame
  frame_type text NOT NULL CHECK (frame_type IN ('light','dark','flat','bias')),
  -- Stockage
  storage_path text NOT NULL,
  file_url text NOT NULL,
  file_size_bytes bigint NOT NULL,
  original_filename text NOT NULL,
  -- Métadonnées FITS/EXIF extraites ou soumises
  metadata jsonb DEFAULT '{}',
  -- Instrument
  telescope text,
  camera text,
  focal_length_mm double precision,
  aperture_mm double precision,
  focal_ratio double precision,
  pixel_size_um double precision,
  sensor_width_px integer,
  sensor_height_px integer,
  -- Acquisition
  exposure_s double precision,
  gain integer,
  offset_int integer,
  temperature_c double precision,
  filter_name text,
  binning integer DEFAULT 1,
  -- Localisation et temps
  latitude double precision,
  longitude double precision,
  altitude_m double precision,
  captured_at timestamptz,
  -- Qualité automatique (calculée par l'IA pipeline)
  fwhm double precision,
  eccentricity double precision,
  snr double precision,
  background_gradient double precision,
  star_count integer,
  -- Plate solving
  solved boolean DEFAULT false,
  solved_ra_deg double precision,
  solved_dec_deg double precision,
  solved_scale_arcsec_px double precision,
  solved_rotation_deg double precision,
  -- Rejet automatique
  rejected boolean DEFAULT false,
  rejection_reason text,
  -- Qualification IA
  quality_score double precision DEFAULT 0,  -- 0 à 1
  ai_analysis jsonb,
  -- Compatibilité pour stacking
  instrument_group text, -- hash de compatibilité instrument
  -- Statut dans le pipeline
  status text DEFAULT 'uploaded' CHECK (status IN (
    'uploaded','extracting','qualifying','qualified',
    'stacking','stacked','rejected'
  )),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_astro_uploads_user ON public.astro_uploads(user_id);
CREATE INDEX idx_astro_uploads_object ON public.astro_uploads(object_id) WHERE object_id IS NOT NULL;
CREATE INDEX idx_astro_uploads_type ON public.astro_uploads(frame_type);
CREATE INDEX idx_astro_uploads_status ON public.astro_uploads(status);
CREATE INDEX idx_astro_uploads_quality ON public.astro_uploads(quality_score DESC) WHERE rejected = false;
CREATE INDEX idx_astro_uploads_group ON public.astro_uploads(instrument_group) WHERE instrument_group IS NOT NULL;

GRANT SELECT ON public.astro_uploads TO authenticated, anon;
GRANT INSERT, UPDATE ON public.astro_uploads TO authenticated;
GRANT ALL ON public.astro_uploads TO service_role;

ALTER TABLE public.astro_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_view_uploads" ON public.astro_uploads FOR SELECT USING (true);
CREATE POLICY "users_insert_uploads" ON public.astro_uploads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_uploads" ON public.astro_uploads FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Jobs de stacking (une tentative de fusion pour un objet)
-- ============================================================
CREATE TABLE public.astro_stacking_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL REFERENCES public.astro_objects(id) ON DELETE CASCADE,
  -- Uploads inclus dans ce job
  light_ids uuid[] NOT NULL DEFAULT '{}',
  dark_ids uuid[] DEFAULT '{}',
  flat_ids uuid[] DEFAULT '{}',
  bias_ids uuid[] DEFAULT '{}',
  -- Statistiques du job
  lights_count integer DEFAULT 0,
  total_exposure_hours double precision DEFAULT 0,
  contributors_count integer DEFAULT 0,
  configurations_count integer DEFAULT 0,
  -- Paramètres de stacking
  stacking_method text DEFAULT 'kappa_sigma' CHECK (stacking_method IN (
    'mean','median','kappa_sigma','winsorized','linear_fit'
  )),
  weighting_mode text DEFAULT 'quality_score' CHECK (weighting_mode IN (
    'equal','snr','fwhm','quality_score','exposure'
  )),
  -- Résultats
  status text DEFAULT 'pending' CHECK (status IN (
    'pending','running','completed','failed'
  )),
  result_image_url text,
  result_thumbnail_url text,
  result_metadata jsonb,
  ai_pipeline_log jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stacking_jobs_object ON public.astro_stacking_jobs(object_id);
CREATE INDEX idx_stacking_jobs_status ON public.astro_stacking_jobs(status);

GRANT SELECT ON public.astro_stacking_jobs TO authenticated, anon;
GRANT ALL ON public.astro_stacking_jobs TO service_role;

ALTER TABLE public.astro_stacking_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_view_jobs" ON public.astro_stacking_jobs FOR SELECT USING (true);

-- ============================================================
-- Masters : images résultantes consolidées par objet
-- ============================================================
CREATE TABLE public.astro_masters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL REFERENCES public.astro_objects(id) ON DELETE CASCADE,
  stacking_job_id uuid REFERENCES public.astro_stacking_jobs(id) ON DELETE SET NULL,
  -- Image finale
  image_url text NOT NULL,
  thumbnail_url text,
  -- Statistiques de la fusion
  lights_stacked integer NOT NULL DEFAULT 0,
  total_exposure_hours double precision NOT NULL DEFAULT 0,
  contributors_count integer NOT NULL DEFAULT 0,
  configurations_count integer NOT NULL DEFAULT 0,
  countries_count integer NOT NULL DEFAULT 0,
  -- Qualité de la fusion
  final_snr double precision,
  final_fwhm double precision,
  dynamic_range_stops double precision,
  -- Métadonnées
  generation integer NOT NULL DEFAULT 1, -- numéro de version du master
  notes text,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_astro_masters_object ON public.astro_masters(object_id);
CREATE INDEX idx_astro_masters_current ON public.astro_masters(object_id, is_current) WHERE is_current = true;

GRANT SELECT ON public.astro_masters TO authenticated, anon;
GRANT ALL ON public.astro_masters TO service_role;

ALTER TABLE public.astro_masters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_view_masters" ON public.astro_masters FOR SELECT USING (true);

-- ============================================================
-- Contributions : lien user ? objet (stats par contributeur)
-- ============================================================
CREATE TABLE public.astro_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  object_id text NOT NULL REFERENCES public.astro_objects(id) ON DELETE CASCADE,
  lights_count integer DEFAULT 0,
  darks_count integer DEFAULT 0,
  flats_count integer DEFAULT 0,
  bias_count integer DEFAULT 0,
  total_exposure_hours double precision DEFAULT 0,
  quality_avg double precision DEFAULT 0,
  first_contribution_at timestamptz DEFAULT now(),
  last_contribution_at timestamptz DEFAULT now(),
  UNIQUE (user_id, object_id)
);

CREATE INDEX idx_contributions_user ON public.astro_contributions(user_id);
CREATE INDEX idx_contributions_object ON public.astro_contributions(object_id);

GRANT SELECT ON public.astro_contributions TO authenticated, anon;
GRANT INSERT, UPDATE ON public.astro_contributions TO authenticated;
GRANT ALL ON public.astro_contributions TO service_role;

ALTER TABLE public.astro_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_view_contributions" ON public.astro_contributions FOR SELECT USING (true);
CREATE POLICY "users_manage_own_contributions" ON public.astro_contributions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Triggers : mise à jour des statistiques agrégées
-- ============================================================

-- Met à jour astro_objects + astro_contributions après un upload qualifié
CREATE OR REPLACE FUNCTION update_object_stats_on_upload()
RETURNS TRIGGER AS $$
BEGIN
  -- Mise à jour des compteurs sur l'objet
  IF NEW.object_id IS NOT NULL AND NEW.rejected = false THEN
    IF NEW.frame_type = 'light' THEN
      UPDATE public.astro_objects
        SET total_lights = total_lights + 1,
            total_exposure_hours = total_exposure_hours + COALESCE(NEW.exposure_s, 0) / 3600.0
        WHERE id = NEW.object_id;
    ELSIF NEW.frame_type = 'dark' THEN
      UPDATE public.astro_objects SET total_darks = total_darks + 1 WHERE id = NEW.object_id;
    ELSIF NEW.frame_type = 'flat' THEN
      UPDATE public.astro_objects SET total_flats = total_flats + 1 WHERE id = NEW.object_id;
    ELSIF NEW.frame_type = 'bias' THEN
      UPDATE public.astro_objects SET total_bias = total_bias + 1 WHERE id = NEW.object_id;
    END IF;

    -- Upsert contributions
    INSERT INTO public.astro_contributions (user_id, object_id,
      lights_count, darks_count, flats_count, bias_count,
      total_exposure_hours, last_contribution_at)
    VALUES (
      NEW.user_id, NEW.object_id,
      CASE WHEN NEW.frame_type = 'light' THEN 1 ELSE 0 END,
      CASE WHEN NEW.frame_type = 'dark' THEN 1 ELSE 0 END,
      CASE WHEN NEW.frame_type = 'flat' THEN 1 ELSE 0 END,
      CASE WHEN NEW.frame_type = 'bias' THEN 1 ELSE 0 END,
      CASE WHEN NEW.frame_type = 'light' THEN COALESCE(NEW.exposure_s, 0) / 3600.0 ELSE 0 END,
      now()
    )
    ON CONFLICT (user_id, object_id) DO UPDATE SET
      lights_count = astro_contributions.lights_count + EXCLUDED.lights_count,
      darks_count  = astro_contributions.darks_count  + EXCLUDED.darks_count,
      flats_count  = astro_contributions.flats_count  + EXCLUDED.flats_count,
      bias_count   = astro_contributions.bias_count   + EXCLUDED.bias_count,
      total_exposure_hours = astro_contributions.total_exposure_hours + EXCLUDED.total_exposure_hours,
      last_contribution_at = now();

    -- Met à jour le compteur de contributeurs uniques
    UPDATE public.astro_objects
      SET total_contributors = (
        SELECT COUNT(DISTINCT user_id)
        FROM public.astro_uploads
        WHERE object_id = NEW.object_id AND rejected = false
      )
      WHERE id = NEW.object_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_object_stats
AFTER INSERT ON public.astro_uploads
FOR EACH ROW EXECUTE FUNCTION update_object_stats_on_upload();

-- Met à jour master_image_url sur astro_objects quand un master est créé
CREATE OR REPLACE FUNCTION update_object_master()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current THEN
    -- Marque les anciens masters comme non courants
    UPDATE public.astro_masters
      SET is_current = false
      WHERE object_id = NEW.object_id AND id != NEW.id;
    -- Met à jour l'objet
    UPDATE public.astro_objects
      SET master_image_url = NEW.image_url,
          master_updated_at = NEW.created_at
      WHERE id = NEW.object_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_object_master
AFTER INSERT OR UPDATE ON public.astro_masters
FOR EACH ROW EXECUTE FUNCTION update_object_master();

-- ============================================================
-- Seed : objets Messier / NGC populaires
-- ============================================================
INSERT INTO public.astro_objects (id, common_name, type, ra_deg, dec_deg, magnitude, size_arcmin, description) VALUES
  ('M31',  'Andromède',           'galaxy',            10.6847,  41.2692, 3.4,  189.0, 'Grande galaxie spirale de la constellation d''Andromède'),
  ('M42',  'Nébuleuse d''Orion',  'nebula',            83.8221,  -5.3911, 4.0,   85.0, 'Nébuleuse diffuse géante dans la constellation d''Orion'),
  ('M45',  'Pléiades',            'cluster_open',      56.8750,  24.1167, 1.6,  110.0, 'Amas ouvert brillant dans le Taureau'),
  ('M51',  'Galaxie du Tourbillon','galaxy',           202.4696,  47.1952, 8.4,   11.2, 'Galaxie spirale avec compagnon NGC 5195'),
  ('M57',  'Nébuleuse de l''Anneau','planetary_nebula',283.3963,  33.0289,8.8,    1.4, 'Nébuleuse planétaire dans la Lyre'),
  ('M101', 'Galaxie du Moulinet', 'galaxy',            210.8024,  54.3489, 7.9,   28.8, 'Grande galaxie spirale en face'),
  ('M13',  'Amas d''Hercule',     'cluster_globular',  250.4234,  36.4613, 5.8,   20.0, 'Plus grand amas globulaire de l''hémisphère nord'),
  ('M27',  'Nébuleuse Haltère',   'planetary_nebula',  299.9013,  22.7214, 7.5,    8.0, 'Nébuleuse planétaire dans le Petit Renard'),
  ('NGC7000','Nébuleuse Amérique du Nord','nebula',    314.7500,  44.3333, 4.0,  120.0, 'Grande nébuleuse en émission en forme de continent'),
  ('IC1805','Nébuleuse du Coeur', 'nebula',             38.1750,  61.4500, 6.5,   60.0, 'Nébuleuse en émission dans Cassiopée'),
  ('M33',  'Galaxie du Triangle', 'galaxy',             23.4620,  30.6603, 5.7,   70.0, 'Galaxie spirale du Groupe Local'),
  ('M81',  'Galaxie de Bode',     'galaxy',            148.8882,  69.0653, 6.9,   26.9, 'Grande galaxie spirale dans la Grande Ourse'),
  ('M82',  'Galaxie Cigare',      'galaxy',            148.9695,  69.6797, 8.4,   11.2, 'Galaxie starburst compagnon de M81'),
  ('M104', 'Galaxie Sombrero',    'galaxy',            189.9976, -11.6231, 8.0,    8.7, 'Galaxie spirale avec anneau de poussière proéminent'),
  ('NGC4889','',                  'galaxy',            195.0338,  27.9769,11.5,    2.8, 'Galaxie elliptique géante dans la Chevelure de Bérénice')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RPC : recherche d'objets + stats pour contribution
-- ============================================================
CREATE OR REPLACE FUNCTION search_astro_objects(
  query text DEFAULT '',
  object_type text DEFAULT NULL,
  min_contributors integer DEFAULT 0,
  limit_count integer DEFAULT 20
)
RETURNS SETOF public.astro_objects AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.astro_objects
  WHERE
    (query = '' OR
      id ILIKE '%' || query || '%' OR
      common_name ILIKE '%' || query || '%'
    )
    AND (object_type IS NULL OR type = object_type)
    AND total_contributors >= min_contributors
  ORDER BY total_lights DESC, id ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC : top contributeurs pour un objet
CREATE OR REPLACE FUNCTION get_top_contributors(
  p_object_id text,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  user_id uuid,
  lights_count integer,
  total_exposure_hours double precision,
  quality_avg double precision,
  last_contribution_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT c.user_id, c.lights_count, c.total_exposure_hours,
         c.quality_avg, c.last_contribution_at
  FROM public.astro_contributions c
  WHERE c.object_id = p_object_id
  ORDER BY c.total_exposure_hours DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC : recommandations pour un utilisateur (objets avec lacunes de data)
CREATE OR REPLACE FUNCTION get_contribution_recommendations(
  p_user_id uuid,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  object_id text,
  common_name text,
  type text,
  total_lights bigint,
  total_contributors integer,
  missing_darks boolean,
  missing_flats boolean,
  score double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.common_name,
    o.type,
    o.total_lights,
    o.total_contributors,
    o.total_darks < 50 as missing_darks,
    o.total_flats < 50 as missing_flats,
    -- Score de besoin : objets populaires avec données manquantes
    (o.total_lights::double precision / GREATEST(1, o.total_contributors) +
     CASE WHEN o.total_darks < 50 THEN 50 ELSE 0 END +
     CASE WHEN o.total_flats < 50 THEN 30 ELSE 0 END) as score
  FROM public.astro_objects o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.astro_contributions c
    WHERE c.user_id = p_user_id AND c.object_id = o.id
  )
  ORDER BY score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

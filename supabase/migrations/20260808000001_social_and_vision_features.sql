-- Table pour les images uploadées par les utilisateurs
CREATE TABLE public.user_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  object_id text NOT NULL,
  object_name text NOT NULL,
  image_url text NOT NULL,
  thumbnail_url text,
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text NOT NULL,
  width integer,
  height integer,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  is_ai_generated boolean DEFAULT false,
  ai_detection_score float,
  ai_detection_metadata jsonb,
  vision_analysis jsonb,
  metadata jsonb,
  CONSTRAINT valid_mime_type CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
);

CREATE INDEX idx_user_images_user_id ON public.user_images(user_id);
CREATE INDEX idx_user_images_object_id ON public.user_images(object_id);
CREATE INDEX idx_user_images_uploaded_at ON public.user_images(uploaded_at DESC);
CREATE INDEX idx_user_images_ai_generated ON public.user_images(is_ai_generated) WHERE is_ai_generated = false;

GRANT SELECT ON public.user_images TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.user_images TO authenticated;
GRANT ALL ON public.user_images TO service_role;

ALTER TABLE public.user_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_images" ON public.user_images FOR SELECT USING (true);
CREATE POLICY "users_insert_own_images" ON public.user_images FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_images" ON public.user_images FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_images" ON public.user_images FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table pour les analyses comparatives d'images
CREATE TABLE public.image_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id text NOT NULL,
  image_ids uuid[] NOT NULL,
  comparison_date timestamptz NOT NULL DEFAULT now(),
  differences_detected jsonb,
  discoveries jsonb,
  confidence_score float,
  analysis_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_comparisons_object_id ON public.image_comparisons(object_id);
CREATE INDEX idx_image_comparisons_date ON public.image_comparisons(comparison_date DESC);

GRANT SELECT ON public.image_comparisons TO authenticated, anon;
GRANT ALL ON public.image_comparisons TO service_role;

ALTER TABLE public.image_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_comparisons" ON public.image_comparisons FOR SELECT USING (true);

-- Extension du profil utilisateur pour le réseau social
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS followers_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS following_count integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS posts_count integer DEFAULT 0;

-- Table des posts (fil d'actualités)
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content text NOT NULL,
  object_id text,
  object_name text,
  image_ids uuid[] DEFAULT '{}',
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  shares_count integer DEFAULT 0,
  visibility text DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_user_id ON public.posts(user_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX idx_posts_object_id ON public.posts(object_id) WHERE object_id IS NOT NULL;

GRANT SELECT ON public.posts TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_public_posts" ON public.posts FOR SELECT USING (
  visibility = 'public' OR 
  (auth.uid() = user_id) OR
  (visibility = 'followers' AND EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND following_id = user_id
  ))
);

CREATE POLICY "users_insert_own_posts" ON public.posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_posts" ON public.posts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_posts" ON public.posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table des likes
CREATE TABLE public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

CREATE INDEX idx_likes_post_id ON public.likes(post_id);
CREATE INDEX idx_likes_user_id ON public.likes(user_id);

GRANT SELECT, INSERT, DELETE ON public.likes TO authenticated;
GRANT ALL ON public.likes TO service_role;

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_likes" ON public.likes FOR SELECT USING (true);
CREATE POLICY "users_insert_likes" ON public.likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_delete_own_likes" ON public.likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table des commentaires
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  content text NOT NULL,
  parent_comment_id uuid REFERENCES public.comments ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_post_id ON public.comments(post_id);
CREATE INDEX idx_comments_user_id ON public.comments(user_id);
CREATE INDEX idx_comments_parent_id ON public.comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

GRANT SELECT ON public.comments TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "users_insert_comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_comments" ON public.comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Table des follows
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

GRANT SELECT ON public.follows TO authenticated, anon;
GRANT INSERT, DELETE ON public.follows TO authenticated;
GRANT ALL ON public.follows TO service_role;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_follows" ON public.follows FOR SELECT USING (true);
CREATE POLICY "users_insert_follows" ON public.follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "users_delete_own_follows" ON public.follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- Table des partages
CREATE TABLE public.shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shares_post_id ON public.shares(post_id);
CREATE INDEX idx_shares_user_id ON public.shares(user_id);

GRANT SELECT, INSERT ON public.shares TO authenticated;
GRANT ALL ON public.shares TO service_role;

ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_view_shares" ON public.shares FOR SELECT USING (true);
CREATE POLICY "users_insert_shares" ON public.shares FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Triggers pour mettre à jour les compteurs
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_likes_count
AFTER INSERT OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

CREATE OR REPLACE FUNCTION update_post_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_comments_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW EXECUTE FUNCTION update_post_comments_count();

CREATE OR REPLACE FUNCTION update_post_shares_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.posts SET shares_count = shares_count + 1 WHERE id = NEW.post_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shares_count
AFTER INSERT ON public.shares
FOR EACH ROW EXECUTE FUNCTION update_post_shares_count();

CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = following_count - 1 WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = followers_count - 1 WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_follow_counts
AFTER INSERT OR DELETE ON public.follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

CREATE OR REPLACE FUNCTION update_posts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET posts_count = posts_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET posts_count = posts_count - 1 WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_posts_count
AFTER INSERT OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION update_posts_count();

-- Fonction pour obtenir le feed personnalisé
CREATE OR REPLACE FUNCTION get_user_feed(user_uuid uuid, limit_count integer DEFAULT 20, offset_count integer DEFAULT 0)
RETURNS TABLE (
  post_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  content text,
  object_id text,
  object_name text,
  image_ids uuid[],
  likes_count integer,
  comments_count integer,
  shares_count integer,
  created_at timestamptz,
  user_liked boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    prof.display_name,
    prof.avatar_url,
    p.content,
    p.object_id,
    p.object_name,
    p.image_ids,
    p.likes_count,
    p.comments_count,
    p.shares_count,
    p.created_at,
    EXISTS(SELECT 1 FROM public.likes l WHERE l.post_id = p.id AND l.user_id = user_uuid) as user_liked
  FROM public.posts p
  INNER JOIN public.profiles prof ON p.user_id = prof.id
  WHERE 
    p.visibility = 'public'
    OR p.user_id = user_uuid
    OR (p.visibility = 'followers' AND EXISTS (
      SELECT 1 FROM public.follows f WHERE f.follower_id = user_uuid AND f.following_id = p.user_id
    ))
  ORDER BY p.created_at DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Storage buckets (à créer via l'interface Supabase Storage)
-- user-images: images uploadées par les utilisateurs
-- user-avatars: avatars des profils
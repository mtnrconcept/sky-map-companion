import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Telescope,
  Send,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";

interface FeedPost {
  post_id: string;
  author_id: string;
  display_name: string | null;
  avatar_url: string | null;
  content: string;
  object_id: string | null;
  object_name: string | null;
  image_ids: string[];
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  user_liked: boolean;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return " l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

function ImageGrid({ imageIds }: { imageIds: string[] }) {
  const { data: images } = useQuery({
    queryKey: ["post-images", imageIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_images")
        .select("id, image_url, object_name")
        .in("id", imageIds);
      if (error) throw error;
      return data;
    },
    enabled: imageIds.length > 0,
  });

  if (!images?.length) return null;

  return (
    <div className={`grid gap-1.5 ${images.length === 1 ? "" : "grid-cols-2"}`}>
      {images.slice(0, 4).map((img: { id: string; image_url: string; object_name: string }) => (
        <div key={img.id} className="aspect-video overflow-hidden rounded-lg bg-muted">
          <img
            src={img.image_url}
            alt={img.object_name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const { data: comments } = useQuery({
    queryKey: ["comments", post.post_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", post.post_id)
        .is("parent_comment_id", null)
        .order("created_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data as Comment[];
    },
    enabled: showComments,
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifi");
      if (post.user_liked) {
        await supabase.from("likes").delete().eq("post_id", post.post_id).eq("user_id", user.id);
      } else {
        await supabase.from("likes").insert({ post_id: post.post_id, user_id: user.id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["social-feed"] }),
    onError: () => toast.error("Impossible de liker ce post."),
  });

  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("Non authentifi");
      const { error } = await supabase
        .from("comments")
        .insert({ post_id: post.post_id, user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["comments", post.post_id] });
      queryClient.invalidateQueries({ queryKey: ["social-feed"] });
    },
    onError: () => toast.error("Impossible d'envoyer le commentaire."),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifi");
      await supabase.from("shares").insert({ post_id: post.post_id, user_id: user.id });
      await navigator.clipboard.writeText(`${window.location.origin}/communaute`);
    },
    onSuccess: () => toast.success("Lien copi dans le presse-papier !"),
    onError: () => toast.error("Impossible de partager."),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link to="/profil/$userId" params={{ userId: post.author_id }}>
              <Avatar className="size-9">
                <AvatarImage src={post.avatar_url ?? undefined} />
                <AvatarFallback>
                  <Telescope className="size-4" />
                </AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <Link
                to="/profil/$userId"
                params={{ userId: post.author_id }}
                className="text-sm font-semibold hover:underline"
              >
                {post.display_name ?? "Astronome"}
              </Link>
              <p className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0">
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {post.object_name && (
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
            <Telescope className="size-3.5 shrink-0 text-primary" />
            <span className="text-sm font-medium">{post.object_name}</span>
          </div>
        )}

        {post.image_ids.length > 0 && <ImageGrid imageIds={post.image_ids} />}

        <Separator />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 ${post.user_liked ? "text-red-500" : ""}`}
            onClick={() => user && likeMutation.mutate()}
            disabled={!user || likeMutation.isPending}
          >
            <Heart className={`size-4 ${post.user_liked ? "fill-current" : ""}`} />
            <span className="tabular-nums">{post.likes_count}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowComments((v) => !v)}
          >
            <MessageCircle className="size-4" />
            <span className="tabular-nums">{post.comments_count}</span>
            {showComments ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => user && shareMutation.mutate()}
            disabled={!user || shareMutation.isPending}
          >
            <Share2 className="size-4" />
            <span className="tabular-nums">{post.shares_count}</span>
          </Button>
        </div>

        {showComments && (
          <div className="space-y-3 border-t pt-3">
            {comments?.map((c: Comment) => (
              <div key={c.id} className="flex gap-2 text-sm">
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    <Telescope className="size-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">Astronome</p>
                  <p>{c.content}</p>
                </div>
              </div>
            ))}

            {user && (
              <div className="flex gap-2">
                <Avatar className="size-6 shrink-0">
                  <AvatarFallback className="text-[10px]">
                    <Telescope className="size-3" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Votre commentaire"
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && commentText.trim()) {
                        e.preventDefault();
                        commentMutation.mutate(commentText.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="size-8 shrink-0 p-0"
                    disabled={!commentText.trim() || commentMutation.isPending}
                    onClick={() => commentMutation.mutate(commentText.trim())}
                  >
                    <Send className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SocialFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newPost, setNewPost] = useState("");

  const { data: posts, isLoading } = useQuery({
    queryKey: ["social-feed"],
    queryFn: async () => {
      if (!user) {
        const { data, error } = await supabase
          .from("posts")
          .select(
            "id, user_id, content, object_id, object_name, image_ids, likes_count, comments_count, shares_count, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(30);
        if (error) throw error;
        return (data ?? []).map((p) => ({
          post_id: p.id,
          author_id: p.user_id,
          display_name: null,
          avatar_url: null,
          content: p.content,
          object_id: p.object_id,
          object_name: p.object_name,
          image_ids: p.image_ids,
          likes_count: p.likes_count,
          comments_count: p.comments_count,
          shares_count: p.shares_count,
          created_at: p.created_at,
          user_liked: false,
        })) as FeedPost[];
      }

      const { data, error } = await supabase.rpc("get_user_feed", {
        p_user_id: user.id,
        p_limit: 30,
        p_offset: 0,
      });
      if (error) throw error;
      return (data ?? []) as FeedPost[];
    },
    refetchInterval: 60_000,
  });

  const createPostMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("Non authentifi");
      const { error } = await supabase.from("posts").insert({ user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewPost("");
      queryClient.invalidateQueries({ queryKey: ["social-feed"] });
      toast.success("Publication partage !");
    },
    onError: () => toast.error("Impossible de publier."),
  });

  return (
    <div className="space-y-4">
      {user && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <Textarea
              placeholder="Partagez votre dernire observation, une question, une dcouverte"
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button
                onClick={() => createPostMutation.mutate(newPost.trim())}
                disabled={!newPost.trim() || createPostMutation.isPending}
                size="sm"
              >
                Publier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!user && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="text-primary underline">
              Connectez-vous
            </Link>{" "}
            pour publier et interagir avec la communaut.
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="text-sm text-muted-foreground">Chargement du fil</span>
        </div>
      ) : posts?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aucune publication pour le moment. Soyez le premier partager une observation !
          </CardContent>
        </Card>
      ) : (
        posts?.map((post: FeedPost) => <PostCard key={post.post_id} post={post} />)
      )}
    </div>
  );
}

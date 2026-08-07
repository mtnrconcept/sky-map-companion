import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppNav";
import { UserProfile } from "@/components/UserProfile";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/profil/$userId")({
  head: () => ({
    meta: [{ title: "Profil astronome - Carte du Ciel" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilPage,
});

interface UserPost {
  id: string;
  content: string;
  object_id: string | null;
  object_name: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
}

function ProfilPage() {
  const { userId } = Route.useParams();

  const { data: posts, isLoading } = useQuery({
    queryKey: ["user-posts", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select(
          "id, content, object_id, object_name, likes_count, comments_count, shares_count, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as UserPost[];
    },
  });

  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader title="Profil" subtitle="Observations et publications de cet astronome" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 pt-6">
        <UserProfile userId={userId} />

        <h2 className="text-base font-semibold">Publications recentes</h2>

        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground">Chargement...</p>
        )}

        {!isLoading && (!posts || posts.length === 0) && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucune publication pour le moment.
            </CardContent>
          </Card>
        )}

        {posts?.map((post: UserPost) => (
          <Card key={post.id}>
            <CardContent className="space-y-2 pt-4">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
              {post.object_name && (
                <p className="text-xs text-muted-foreground">{post.object_name}</p>
              )}
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{post.likes_count} j'aime</span>
                <span>{post.comments_count} commentaires</span>
                <span>{post.shares_count} partages</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

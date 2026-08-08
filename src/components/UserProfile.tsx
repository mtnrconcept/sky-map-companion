import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Telescope, MapPin, UserPlus, UserMinus, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@tanstack/react-router";

interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
}

export function UserProfile({ userId }: { userId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isOwnProfile = user?.id === userId;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, avatar_url, bio, location, followers_count, following_count, posts_count",
        )
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  const { data: isFollowing } = useQuery({
    queryKey: ["is-following", user?.id, userId],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", userId)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user && !isOwnProfile,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifi");
      if (isFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", userId);
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["is-following"] });
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      toast.success(isFollowing ? "Abonnement annul." : "Vous suivez cet astronome !");
    },
    onError: () => toast.error("Action impossible."),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Chargement du profil
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Profil introuvable.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 shrink-0">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-lg">
              <Telescope className="size-7" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="truncate text-lg font-semibold">
                {profile.display_name ?? "Astronome"}
              </h2>

              {isOwnProfile ? (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link to="/auth">
                    <Settings className="size-3.5" />
                    Modifier
                  </Link>
                </Button>
              ) : user ? (
                <Button
                  size="sm"
                  variant={isFollowing ? "outline" : "default"}
                  className="gap-1.5"
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                >
                  {isFollowing ? (
                    <>
                      <UserMinus className="size-3.5" />
                      Ne plus suivre
                    </>
                  ) : (
                    <>
                      <UserPlus className="size-3.5" />
                      Suivre
                    </>
                  )}
                </Button>
              ) : null}
            </div>

            {profile.location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {profile.location}
              </p>
            )}

            {profile.bio && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
            )}

            <div className="mt-3 flex gap-4">
              <div className="text-center">
                <p className="tabular-nums text-lg font-bold">{profile.posts_count}</p>
                <p className="text-xs text-muted-foreground">Publications</p>
              </div>
              <div className="text-center">
                <p className="tabular-nums text-lg font-bold">{profile.followers_count}</p>
                <p className="text-xs text-muted-foreground">Abonns</p>
              </div>
              <div className="text-center">
                <p className="tabular-nums text-lg font-bold">{profile.following_count}</p>
                <p className="text-xs text-muted-foreground">Abonnements</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

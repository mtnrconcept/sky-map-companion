import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useFavorites() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["favorites", user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("id, object_id, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ids = new Set((query.data ?? []).map((f) => f.object_id));

  const toggle = useMutation({
    mutationFn: async (objectId: string) => {
      if (!user) throw new Error("Connexion requise");
      if (ids.has(objectId)) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("object_id", objectId)
          .eq("user_id", user.id);
        if (error) throw error;
        return "removed" as const;
      }
      const { error } = await supabase
        .from("favorites")
        .insert({ object_id: objectId, user_id: user.id });
      if (error) throw error;
      return "added" as const;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return {
    user,
    favorites: query.data ?? [],
    isFavorite: (id: string) => ids.has(id),
    toggle,
    loading: query.isLoading,
  };
}

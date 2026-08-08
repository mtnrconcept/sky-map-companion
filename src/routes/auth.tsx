import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Carte du Ciel" },
      {
        name: "description",
        content:
          "Connectez-vous pour enregistrer vos objets célestes favoris et vos lieux d'observation.",
      },
      { property: "og:title", content: "Connexion — Carte du Ciel" },
      {
        property: "og:description",
        content: "Enregistrez vos favoris et vos lieux d'observation.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Vérifiez votre boîte mail pour confirmer votre compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Connexion Google impossible");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  if (user) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-6">
        <p className="label-caps text-primary">Compte</p>
        <h1 className="text-2xl font-semibold">{user.email}</h1>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link to="/">Retour au ciel</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/" });
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-6">
      <p className="label-caps text-primary">Carte du Ciel</p>
      <h1 className="mt-2 text-2xl font-semibold">
        {mode === "signin" ? "Se connecter" : "Créer un compte"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pour retrouver vos favoris d'une nuit à l'autre.
      </p>

      <Button className="mt-6" variant="secondary" onClick={google}>
        Continuer avec Google
      </Button>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {mode === "signin" ? "Se connecter" : "Créer mon compte"}
        </Button>
      </form>

      <button
        className="mt-4 text-sm text-muted-foreground underline"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin" ? "Pas encore de compte ? En créer un" : "J'ai déjà un compte"}
      </button>
      <Link to="/" className="mt-6 text-sm text-primary">
        ← Retour au ciel
      </Link>
    </main>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppNav";
import { SocialFeed } from "@/components/SocialFeed";
import { CommunityGallery } from "@/components/CommunityGallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/communaute")({
  head: () => ({
    meta: [
      { title: "Communaute - Carte du Ciel" },
      {
        name: "description",
        content:
          "Partagez vos observations, suivez d'autres astronomes et participez aux decouvertes collaboratives.",
      },
      { property: "og:title", content: "Communaute - Carte du Ciel" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: CommunautePage,
});

function CommunautePage() {
  return (
    <main className="min-h-[100dvh] bg-background pb-20">
      <PageHeader
        title="Communaute"
        subtitle="Partagez vos observations et participez aux decouvertes collaboratives"
      />
      <div className="mx-auto max-w-3xl px-4 pt-6">
        <Tabs defaultValue="feed">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="feed">Fil d'actualites</TabsTrigger>
            <TabsTrigger value="gallery">Galerie collaborative</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="mt-6">
            <SocialFeed />
          </TabsContent>

          <TabsContent value="gallery" className="mt-6">
            <CommunityGallery />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

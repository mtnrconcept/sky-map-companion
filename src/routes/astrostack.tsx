import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppNav";
import { AstroObjectList } from "@/components/AstroObjectList";
import { AstroObjectMaster } from "@/components/AstroObjectMaster";
import { AstroUploadZone } from "@/components/AstroUploadZone";
import { AstroUploadQueue } from "@/components/AstroUploadQueue";
import { useAstroStack } from "@/hooks/useAstroStack";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/astrostack")({
  head: () => ({
    meta: [
      { title: "AstroStack Global — Moteur de fusion astrophotographique" },
      {
        name: "description",
        content:
          "Déposez des RAW privés, suivez leur qualification WCS et contribuez aux masters astrophotographiques mondiaux.",
      },
    ],
  }),
  component: AstroStackPage,
});

function GlobalStats({ objects }: { objects: ReturnType<typeof useAstroStack>["objects"] }) {
  const totalLights = objects.reduce((s, o) => s + o.total_lights, 0);
  const totalContribs = objects.reduce((s, o) => s + o.total_contributors, 0);
  const totalHours = objects.reduce((s, o) => s + o.total_exposure_hours, 0);
  const mastersCount = objects.filter((o) => o.master_image_url).length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Frames mondiales", value: totalLights.toLocaleString(), icon: "🖼️" },
        { label: "Contributeurs", value: totalContribs.toLocaleString(), icon: "👥" },
        { label: "Heures de pose", value: `${totalHours.toFixed(0)}h`, icon: "⏱️" },
        { label: "Masters générés", value: mastersCount.toString(), icon: "🌌" },
      ].map((s) => (
        <Card key={s.label} className="bg-card/50 backdrop-blur-sm">
          <CardContent className="p-3 text-center">
            <p className="text-xl">{s.icon}</p>
            <p className="text-lg font-bold tabular-nums mt-1">{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AstroStackPage() {
  const {
    objects,
    selectedObject,
    masters,
    recentJobs,
    userUploads,
    isLoadingObjects,
    isStacking,
    searchQuery,
    setSearchQuery,
    selectObject,
    uploadFrames,
    triggerStacking,
  } = useAstroStack();

  const [activeTab, setActiveTab] = useState<"master" | "upload" | "queue">("master");

  return (
    <main className="min-h-[100dvh] bg-background pb-24">
      <PageHeader
        title="AstroStack Global"
        subtitle="Qualification WCS, contribution privée et fusion astrophotographique mondiale"
      />

      <div className="mx-auto max-w-7xl px-4 pt-6 space-y-6">
        {/* En-tête scientifique */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl shrink-0">🧪</span>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Pipeline scientifique traçable
              </p>
              <p>
                Les originaux restent privés. Chaque image passe par une résolution astrométrique,
                des métriques déterministes et une validation explicable avant de contribuer à une
                cellule ou à un master. Aucun résultat de secours n'est simulé.
              </p>
            </div>
          </div>
        </div>

        {/* Stats globales */}
        <GlobalStats objects={objects} />

        {/* Layout principal : liste + détail */}
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]" style={{ minHeight: 700 }}>
          {/* Panneau gauche : liste des objets */}
          <div
            className="rounded-xl border border-border overflow-hidden flex flex-col"
            style={{ maxHeight: 700 }}
          >
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                Objets du catalogue
              </p>
            </div>
            <AstroObjectList
              objects={objects}
              selected={selectedObject}
              onSelect={selectObject}
              searchQuery={searchQuery}
              onSearch={setSearchQuery}
              isLoading={isLoadingObjects}
            />
          </div>

          {/* Panneau droit : onglets */}
          {selectedObject ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="master">🌌 Master mondial</TabsTrigger>
                <TabsTrigger value="upload">📤 Contribuer</TabsTrigger>
                <TabsTrigger value="queue">
                  📋 File d'upload
                  {userUploads.length > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-[10px]">
                      {userUploads.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="master" className="mt-4">
                <AstroObjectMaster
                  object={selectedObject}
                  masters={masters}
                  recentJobs={recentJobs}
                  onTriggerStack={() => triggerStacking(selectedObject.id)}
                  isStacking={isStacking}
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <Card className="bg-card/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      📤 Contribuer à {selectedObject.id}
                      {selectedObject.common_name && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          — {selectedObject.common_name}
                        </span>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Jusqu’à 5 Gio par fichier, transfert résumable. Une licence explicite est
                      requise avant la qualification scientifique.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <AstroUploadZone objectId={selectedObject.id} onUpload={uploadFrames} />
                  </CardContent>
                </Card>

                {/* Pipeline expliqué */}
                <Card className="mt-4 bg-card/30 border-dashed">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold mb-3 text-foreground">
                      Pipeline scientifique appliqué
                    </p>
                    <div className="space-y-1.5 text-[11px] text-muted-foreground font-mono">
                      {[
                        ["1", "Extraction des métadonnées FITS/EXIF"],
                        ["2", "Résolution WCS et empreinte céleste mesurée"],
                        ["3", "FWHM, excentricité, SNR, saturation et couverture"],
                        ["4", "Score explicable et attribution HEALPix atomique"],
                        ["5", "Calibration et alignement par configuration compatible"],
                        ["6", "Stacking pondéré et publication immuable"],
                      ].map(([n, step]) => (
                        <div key={n} className="flex gap-2">
                          <span className="text-primary font-bold">{n}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="queue" className="mt-4">
                <Card className="bg-card/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">File de traitement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <AstroUploadQueue uploads={userUploads} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
              <span className="text-5xl mb-4">🔭</span>
              <p className="text-base font-semibold">Sélectionnez un objet</p>
              <p className="mt-2 text-xs text-muted-foreground max-w-sm">
                Choisissez un objet dans la liste pour voir son master mondial, ses statistiques et
                contribuer vos frames.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

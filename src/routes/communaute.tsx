import{createFileRoute}from"@tanstack/react-router";
import{PageHeader}from"@/components/AppNav";
import{SocialFeed}from"@/components/SocialFeed";
import{CommunityGallery}from"@/components/CommunityGallery";
import{Tabs,TabsContent,TabsList,TabsTrigger}from"@/components/ui/tabs";

exportconstRoute=createFileRoute("/communaute")({
head:()=>({
meta:[
{title:"Communaute-CarteduCiel"},
{
name:"description",
content:
"Partagezvosobservations,suivezd'autresastronomesetparticipezauxdecouvertescollaboratives.",
},
{property:"og:title",content:"Communaute-CarteduCiel"},
{property:"og:type",content:"website"},
],
}),
component:CommunautePage,
});

functionCommunautePage(){
return(
<mainclassName="min-h-[100dvh]bg-backgroundpb-20">
<PageHeader
title="Communaute"
subtitle="Partagezvosobservationsetparticipezauxdecouvertescollaboratives"
/>
<divclassName="mx-automax-w-3xlpx-4pt-6">
<TabsdefaultValue="feed">
<TabsListclassName="gridw-fullgrid-cols-2">
<TabsTriggervalue="feed">Fild'actualites</TabsTrigger>
<TabsTriggervalue="gallery">Galeriecollaborative</TabsTrigger>
</TabsList>

<TabsContentvalue="feed"className="mt-6">
<SocialFeed/>
</TabsContent>

<TabsContentvalue="gallery"className="mt-6">
<CommunityGallery/>
</TabsContent>
</Tabs>
</div>
</main>
);
}

import{createFileRoute}from"@tanstack/react-router";
import{useQuery}from"@tanstack/react-query";
import{PageHeader}from"@/components/AppNav";
import{UserProfile}from"@/components/UserProfile";
import{supabase}from"@/integrations/supabase/client";
import{Card,CardContent}from"@/components/ui/card";

exportconstRoute=createFileRoute("/profil/$userId")({
head:()=>({
meta:[{title:"Profilastronome-CarteduCiel"},{name:"robots",content:"noindex"}],
}),
component:ProfilPage,
});

interfaceUserPost{
id:string;
content:string;
object_id:string|null;
object_name:string|null;
likes_count:number;
comments_count:number;
shares_count:number;
created_at:string;
}

functionProfilPage(){
const{userId}=Route.useParams();

const{data:posts,isLoading}=useQuery({
queryKey:["user-posts",userId],
queryFn:async()=>{
const{data,error}=awaitsupabase
.from("posts")
.select(
"id,content,object_id,object_name,likes_count,comments_count,shares_count,created_at",
)
.eq("user_id",userId)
.order("created_at",{ascending:false})
.limit(20);
if(error)throwerror;
returndataasUserPost[];
},
});

return(
<mainclassName="min-h-[100dvh]bg-backgroundpb-20">
<PageHeadertitle="Profil"subtitle="Observationsetpublicationsdecetastronome"/>
<divclassName="mx-automax-w-3xlspace-y-6px-4pt-6">
<UserProfileuserId={userId}/>

<h2className="text-basefont-semibold">Publicationsrecentes</h2>

{isLoading&&(
<pclassName="py-8text-centertext-smtext-muted-foreground">Chargement...</p>
)}

{!isLoading&&(!posts||posts.length===0)&&(
<Card>
<CardContentclassName="py-10text-centertext-smtext-muted-foreground">
Aucunepublicationpourlemoment.
</CardContent>
</Card>
)}

{posts?.map((post:UserPost)=>(
<Cardkey={post.id}>
<CardContentclassName="space-y-2pt-4">
<pclassName="text-smleading-relaxedwhitespace-pre-wrap">{post.content}</p>
{post.object_name&&(
<pclassName="text-xstext-muted-foreground">{post.object_name}</p>
)}
<divclassName="flexgap-4text-xstext-muted-foreground">
<span>{post.likes_count}j'aime</span>
<span>{post.comments_count}commentaires</span>
<span>{post.shares_count}partages</span>
</div>
</CardContent>
</Card>
))}
</div>
</main>
);
}

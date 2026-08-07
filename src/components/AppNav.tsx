<<<<<<< HEAD
import{Link,useRouterState}from"@tanstack/react-router";
import{Telescope,Search,Bot,BookOpen,Map,Users,Radio,Layers}from"lucide-react";
import{cn}from"@/lib/utils";

constlinks=[
{to:"/",label:"Ciel",icon:Map},
{to:"/explorer",label:"Explorer",icon:Search},
{to:"/cosmos-live",label:"CosmosLive",icon:Radio},
{to:"/astrostack",label:"AstroStack",icon:Layers},
{to:"/assistant",label:"Assistant",icon:Bot},
{to:"/ressources",label:"Ressources",icon:BookOpen},
{to:"/communaute",label:"Communauté",icon:Users},
]asconst;
=======
import { Link, useRouterState } from "@tanstack/react-router";
import { Telescope, Search, Bot, BookOpen, Map, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Ciel", icon: Map },
  { to: "/explorer", label: "Explorer", icon: Search },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/ressources", label: "Ressources", icon: BookOpen },
  { to: "/communaute", label: "Communaut�", icon: Users },
] as const;
>>>>>>> parent of 1574b2d (feat: Cosmos Live — observatoire collaboratif en te)

exportfunctionAppNav({compact=false}:{compact?:boolean}){
constpathname=useRouterState({select:(s)=>s.location.pathname});
return(
<navclassName="flexitems-centergap-1">
{links.map((l)=>{
constactive=l.to==="/"?pathname==="/":pathname.startsWith(l.to);
return(
<Link
key={l.to}
to={l.to}
className={cn(
"flexitems-centergap-1.5rounded-mdpx-2.5py-1.5text-xsfont-mediumtransition-colors",
active
?"bg-primary/15text-primary"
:"text-muted-foregroundhover:bg-accenthover:text-foreground",
)}
>
<l.iconclassName="size-3.5"/>
<spanclassName={compact?"hiddensm:inline":""}>{l.label}</span>
</Link>
);
})}
</nav>
);
}

exportfunctionPageHeader({title,subtitle}:{title:string;subtitle:string}){
return(
<headerclassName="stickytop-0z-30border-bborder-border/60bg-background/80backdrop-blur">
<divclassName="mx-autoflexmax-w-6xlflex-wrapitems-centergap-3px-4py-3">
<Linkto="/"className="flexitems-centergap-2text-smfont-semibold">
<TelescopeclassName="size-4text-primary"/>
CarteduCiel
</Link>
<divclassName="ml-auto">
<AppNavcompact/>
</div>
</div>
<divclassName="mx-automax-w-6xlpx-4pb-4">
<h1className="text-2xlfont-semiboldtracking-tight">{title}</h1>
<pclassName="mt-1text-smtext-muted-foreground">{subtitle}</p>
</div>
</header>
);
}

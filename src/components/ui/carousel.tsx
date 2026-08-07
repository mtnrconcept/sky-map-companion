import*asReactfrom"react";
importuseEmblaCarousel,{typeUseEmblaCarouselType}from"embla-carousel-react";
import{ArrowLeft,ArrowRight}from"lucide-react";

import{cn}from"@/lib/utils";
import{Button}from"@/components/ui/button";

typeCarouselApi=UseEmblaCarouselType[1];
typeUseCarouselParameters=Parameters<typeofuseEmblaCarousel>;
typeCarouselOptions=UseCarouselParameters[0];
typeCarouselPlugin=UseCarouselParameters[1];

typeCarouselProps={
opts?:CarouselOptions;
plugins?:CarouselPlugin;
orientation?:"horizontal"|"vertical";
setApi?:(api:CarouselApi)=>void;
};

typeCarouselContextProps={
carouselRef:ReturnType<typeofuseEmblaCarousel>[0];
api:ReturnType<typeofuseEmblaCarousel>[1];
scrollPrev:()=>void;
scrollNext:()=>void;
canScrollPrev:boolean;
canScrollNext:boolean;
}&CarouselProps;

constCarouselContext=React.createContext<CarouselContextProps|null>(null);

functionuseCarousel(){
constcontext=React.useContext(CarouselContext);

if(!context){
thrownewError("useCarouselmustbeusedwithina<Carousel/>");
}

returncontext;
}

constCarousel=React.forwardRef<
HTMLDivElement,
React.HTMLAttributes<HTMLDivElement>&CarouselProps
>(({orientation="horizontal",opts,setApi,plugins,className,children,...props},ref)=>{
const[carouselRef,api]=useEmblaCarousel(
{
...opts,
axis:orientation==="horizontal"?"x":"y",
},
plugins,
);
const[canScrollPrev,setCanScrollPrev]=React.useState(false);
const[canScrollNext,setCanScrollNext]=React.useState(false);

constonSelect=React.useCallback((api:CarouselApi)=>{
if(!api){
return;
}

setCanScrollPrev(api.canScrollPrev());
setCanScrollNext(api.canScrollNext());
},[]);

constscrollPrev=React.useCallback(()=>{
api?.scrollPrev();
},[api]);

constscrollNext=React.useCallback(()=>{
api?.scrollNext();
},[api]);

consthandleKeyDown=React.useCallback(
(event:React.KeyboardEvent<HTMLDivElement>)=>{
if(event.key==="ArrowLeft"){
event.preventDefault();
scrollPrev();
}elseif(event.key==="ArrowRight"){
event.preventDefault();
scrollNext();
}
},
[scrollPrev,scrollNext],
);

React.useEffect(()=>{
if(!api||!setApi){
return;
}

setApi(api);
},[api,setApi]);

React.useEffect(()=>{
if(!api){
return;
}

onSelect(api);
api.on("reInit",onSelect);
api.on("select",onSelect);

return()=>{
api?.off("select",onSelect);
};
},[api,onSelect]);

return(
<CarouselContext.Provider
value={{
carouselRef,
api:api,
opts,
orientation:orientation||(opts?.axis==="y"?"vertical":"horizontal"),
scrollPrev,
scrollNext,
canScrollPrev,
canScrollNext,
}}
>
<div
ref={ref}
onKeyDownCapture={handleKeyDown}
className={cn("relative",className)}
role="region"
aria-roledescription="carousel"
{...props}
>
{children}
</div>
</CarouselContext.Provider>
);
});
Carousel.displayName="Carousel";

constCarouselContent=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>{
const{carouselRef,orientation}=useCarousel();

return(
<divref={carouselRef}className="overflow-hidden">
<div
ref={ref}
className={cn(
"flex",
orientation==="horizontal"?"-ml-4":"-mt-4flex-col",
className,
)}
{...props}
/>
</div>
);
},
);
CarouselContent.displayName="CarouselContent";

constCarouselItem=React.forwardRef<HTMLDivElement,React.HTMLAttributes<HTMLDivElement>>(
({className,...props},ref)=>{
const{orientation}=useCarousel();

return(
<div
ref={ref}
role="group"
aria-roledescription="slide"
className={cn(
"min-w-0shrink-0grow-0basis-full",
orientation==="horizontal"?"pl-4":"pt-4",
className,
)}
{...props}
/>
);
},
);
CarouselItem.displayName="CarouselItem";

constCarouselPrevious=React.forwardRef<HTMLButtonElement,React.ComponentProps<typeofButton>>(
({className,variant="outline",size="icon",...props},ref)=>{
const{orientation,scrollPrev,canScrollPrev}=useCarousel();

return(
<Button
ref={ref}
variant={variant}
size={size}
className={cn(
"absoluteh-8w-8rounded-full",
orientation==="horizontal"
?"-left-12top-1/2-translate-y-1/2"
:"-top-12left-1/2-translate-x-1/2rotate-90",
className,
)}
disabled={!canScrollPrev}
onClick={scrollPrev}
{...props}
>
<ArrowLeftclassName="h-4w-4"/>
<spanclassName="sr-only">Previousslide</span>
</Button>
);
},
);
CarouselPrevious.displayName="CarouselPrevious";

constCarouselNext=React.forwardRef<HTMLButtonElement,React.ComponentProps<typeofButton>>(
({className,variant="outline",size="icon",...props},ref)=>{
const{orientation,scrollNext,canScrollNext}=useCarousel();

return(
<Button
ref={ref}
variant={variant}
size={size}
className={cn(
"absoluteh-8w-8rounded-full",
orientation==="horizontal"
?"-right-12top-1/2-translate-y-1/2"
:"-bottom-12left-1/2-translate-x-1/2rotate-90",
className,
)}
disabled={!canScrollNext}
onClick={scrollNext}
{...props}
>
<ArrowRightclassName="h-4w-4"/>
<spanclassName="sr-only">Nextslide</span>
</Button>
);
},
);
CarouselNext.displayName="CarouselNext";

export{
typeCarouselApi,
Carousel,
CarouselContent,
CarouselItem,
CarouselPrevious,
CarouselNext,
};

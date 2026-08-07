"useclient";

import{cn}from"@/lib/utils";
importtype{MotionProps}from"motion/react";
import{motion}from"motion/react";
importtype{CSSProperties,ElementType,JSX}from"react";
import{memo,useMemo}from"react";

typeMotionHTMLProps=MotionProps&Record<string,unknown>;

//Cachemotioncomponentsatmoduleleveltoavoidcreatingduringrender
constmotionComponentCache=newMap<
keyofJSX.IntrinsicElements,
React.ComponentType<MotionHTMLProps>
>();

constgetMotionComponent=(element:keyofJSX.IntrinsicElements)=>{
letcomponent=motionComponentCache.get(element);
if(!component){
component=motion.create(element);
motionComponentCache.set(element,component);
}
returncomponent;
};

exportinterfaceTextShimmerProps{
children:string;
as?:ElementType;
className?:string;
duration?:number;
spread?:number;
}

constShimmerComponent=({
children,
as:Component="p",
className,
duration=2,
spread=2,
}:TextShimmerProps)=>{
constMotionComponent=getMotionComponent(
ComponentaskeyofJSX.IntrinsicElements
);

constdynamicSpread=useMemo(
()=>(children?.length??0)*spread,
[children,spread]
);

return(
<MotionComponent
animate={{backgroundPosition:"0%center"}}
className={cn(
"relativeinline-blockbg-[length:250%_100%,auto]bg-clip-texttext-transparent",
"[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))][background-repeat:no-repeat,padding-box]",
className
)}
initial={{backgroundPosition:"100%center"}}
style={
{
"--spread":`${dynamicSpread}px`,
backgroundImage:
"var(--bg),linear-gradient(var(--color-muted-foreground),var(--color-muted-foreground))",
}asCSSPropertiesasnever
}
transition={{
duration,
ease:"linear",
repeat:Number.POSITIVE_INFINITY,
}}
>
{children}
</MotionComponent>
);
};

exportconstShimmer=memo(ShimmerComponent);

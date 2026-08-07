"useclient";

import*asReactfrom"react";
import*asProgressPrimitivefrom"@radix-ui/react-progress";

import{cn}from"@/lib/utils";

constProgress=React.forwardRef<
React.ElementRef<typeofProgressPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofProgressPrimitive.Root>
>(({className,value,...props},ref)=>(
<ProgressPrimitive.Root
ref={ref}
className={cn("relativeh-2w-fulloverflow-hiddenrounded-fullbg-primary/20",className)}
{...props}
>
<ProgressPrimitive.Indicator
className="h-fullw-fullflex-1bg-primarytransition-all"
style={{transform:`translateX(-${100-(value||0)}%)`}}
/>
</ProgressPrimitive.Root>
));
Progress.displayName=ProgressPrimitive.Root.displayName;

export{Progress};

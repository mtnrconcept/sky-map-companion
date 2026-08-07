"useclient";

import*asReactfrom"react";
import*asTooltipPrimitivefrom"@radix-ui/react-tooltip";

import{cn}from"@/lib/utils";

constTooltipProvider=TooltipPrimitive.Provider;

constTooltip=TooltipPrimitive.Root;

constTooltipTrigger=TooltipPrimitive.Trigger;

constTooltipContent=React.forwardRef<
React.ElementRef<typeofTooltipPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofTooltipPrimitive.Content>
>(({className,sideOffset=4,...props},ref)=>(
<TooltipPrimitive.Portal>
<TooltipPrimitive.Content
ref={ref}
sideOffset={sideOffset}
className={cn(
"z-50overflow-hiddenrounded-mdbg-primarypx-3py-1.5text-xstext-primary-foregroundanimate-infade-in-0zoom-in-95data-[state=closed]:animate-outdata-[state=closed]:fade-out-0data-[state=closed]:zoom-out-95data-[side=bottom]:slide-in-from-top-2data-[side=left]:slide-in-from-right-2data-[side=right]:slide-in-from-left-2data-[side=top]:slide-in-from-bottom-2origin-(--radix-tooltip-content-transform-origin)",
className,
)}
{...props}
/>
</TooltipPrimitive.Portal>
));
TooltipContent.displayName=TooltipPrimitive.Content.displayName;

export{Tooltip,TooltipTrigger,TooltipContent,TooltipProvider};

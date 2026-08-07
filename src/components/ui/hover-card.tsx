import*asReactfrom"react";
import*asHoverCardPrimitivefrom"@radix-ui/react-hover-card";

import{cn}from"@/lib/utils";

constHoverCard=HoverCardPrimitive.Root;

constHoverCardTrigger=HoverCardPrimitive.Trigger;

constHoverCardContent=React.forwardRef<
React.ElementRef<typeofHoverCardPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofHoverCardPrimitive.Content>
>(({className,align="center",sideOffset=4,...props},ref)=>(
<HoverCardPrimitive.Content
ref={ref}
align={align}
sideOffset={sideOffset}
className={cn(
"z-50w-64rounded-mdborderbg-popoverp-4text-popover-foregroundshadow-mdoutline-nonedata-[state=open]:animate-indata-[state=closed]:animate-outdata-[state=closed]:fade-out-0data-[state=open]:fade-in-0data-[state=closed]:zoom-out-95data-[state=open]:zoom-in-95data-[side=bottom]:slide-in-from-top-2data-[side=left]:slide-in-from-right-2data-[side=right]:slide-in-from-left-2data-[side=top]:slide-in-from-bottom-2origin-(--radix-hover-card-content-transform-origin)",
className,
)}
{...props}
/>
));
HoverCardContent.displayName=HoverCardPrimitive.Content.displayName;

export{HoverCard,HoverCardTrigger,HoverCardContent};

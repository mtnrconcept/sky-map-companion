import*asReactfrom"react";
import*asPopoverPrimitivefrom"@radix-ui/react-popover";

import{cn}from"@/lib/utils";

constPopover=PopoverPrimitive.Root;

constPopoverTrigger=PopoverPrimitive.Trigger;

constPopoverAnchor=PopoverPrimitive.Anchor;

constPopoverContent=React.forwardRef<
React.ElementRef<typeofPopoverPrimitive.Content>,
React.ComponentPropsWithoutRef<typeofPopoverPrimitive.Content>
>(({className,align="center",sideOffset=4,...props},ref)=>(
<PopoverPrimitive.Portal>
<PopoverPrimitive.Content
ref={ref}
align={align}
sideOffset={sideOffset}
className={cn(
"z-50w-72rounded-mdborderbg-popoverp-4text-popover-foregroundshadow-mdoutline-nonedata-[state=open]:animate-indata-[state=closed]:animate-outdata-[state=closed]:fade-out-0data-[state=open]:fade-in-0data-[state=closed]:zoom-out-95data-[state=open]:zoom-in-95data-[side=bottom]:slide-in-from-top-2data-[side=left]:slide-in-from-right-2data-[side=right]:slide-in-from-left-2data-[side=top]:slide-in-from-bottom-2origin-(--radix-popover-content-transform-origin)",
className,
)}
{...props}
/>
</PopoverPrimitive.Portal>
));
PopoverContent.displayName=PopoverPrimitive.Content.displayName;

export{Popover,PopoverTrigger,PopoverContent,PopoverAnchor};

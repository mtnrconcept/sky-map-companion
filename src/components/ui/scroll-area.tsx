import*asReactfrom"react";
import*asScrollAreaPrimitivefrom"@radix-ui/react-scroll-area";

import{cn}from"@/lib/utils";

constScrollArea=React.forwardRef<
React.ElementRef<typeofScrollAreaPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofScrollAreaPrimitive.Root>
>(({className,children,...props},ref)=>(
<ScrollAreaPrimitive.Root
ref={ref}
className={cn("relativeoverflow-hidden",className)}
{...props}
>
<ScrollAreaPrimitive.ViewportclassName="h-fullw-fullrounded-[inherit]">
{children}
</ScrollAreaPrimitive.Viewport>
<ScrollBar/>
<ScrollAreaPrimitive.Corner/>
</ScrollAreaPrimitive.Root>
));
ScrollArea.displayName=ScrollAreaPrimitive.Root.displayName;

constScrollBar=React.forwardRef<
React.ElementRef<typeofScrollAreaPrimitive.ScrollAreaScrollbar>,
React.ComponentPropsWithoutRef<typeofScrollAreaPrimitive.ScrollAreaScrollbar>
>(({className,orientation="vertical",...props},ref)=>(
<ScrollAreaPrimitive.ScrollAreaScrollbar
ref={ref}
orientation={orientation}
className={cn(
"flextouch-noneselect-nonetransition-colors",
orientation==="vertical"&&"h-fullw-2.5border-lborder-l-transparentp-[1px]",
orientation==="horizontal"&&"h-2.5flex-colborder-tborder-t-transparentp-[1px]",
className,
)}
{...props}
>
<ScrollAreaPrimitive.ScrollAreaThumbclassName="relativeflex-1rounded-fullbg-border"/>
</ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName=ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export{ScrollArea,ScrollBar};

import*asReactfrom"react";
import*asSeparatorPrimitivefrom"@radix-ui/react-separator";

import{cn}from"@/lib/utils";

constSeparator=React.forwardRef<
React.ElementRef<typeofSeparatorPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofSeparatorPrimitive.Root>
>(({className,orientation="horizontal",decorative=true,...props},ref)=>(
<SeparatorPrimitive.Root
ref={ref}
decorative={decorative}
orientation={orientation}
className={cn(
"shrink-0bg-border",
orientation==="horizontal"?"h-[1px]w-full":"h-fullw-[1px]",
className,
)}
{...props}
/>
));
Separator.displayName=SeparatorPrimitive.Root.displayName;

export{Separator};

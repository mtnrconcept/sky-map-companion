import*asReactfrom"react";
import*asCheckboxPrimitivefrom"@radix-ui/react-checkbox";
import{Check}from"lucide-react";

import{cn}from"@/lib/utils";

constCheckbox=React.forwardRef<
React.ElementRef<typeofCheckboxPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofCheckboxPrimitive.Root>
>(({className,...props},ref)=>(
<CheckboxPrimitive.Root
ref={ref}
className={cn(
"gridplace-content-centerpeerh-4w-4shrink-0rounded-smborderborder-primaryshadowcursor-pointerfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:cursor-not-alloweddisabled:opacity-50data-[state=checked]:bg-primarydata-[state=checked]:text-primary-foreground",
className,
)}
{...props}
>
<CheckboxPrimitive.IndicatorclassName={cn("gridplace-content-centertext-current")}>
<CheckclassName="h-4w-4"/>
</CheckboxPrimitive.Indicator>
</CheckboxPrimitive.Root>
));
Checkbox.displayName=CheckboxPrimitive.Root.displayName;

export{Checkbox};

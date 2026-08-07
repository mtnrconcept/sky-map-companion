import*asReactfrom"react";
import*asRadioGroupPrimitivefrom"@radix-ui/react-radio-group";
import{Circle}from"lucide-react";

import{cn}from"@/lib/utils";

constRadioGroup=React.forwardRef<
React.ElementRef<typeofRadioGroupPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofRadioGroupPrimitive.Root>
>(({className,...props},ref)=>{
return<RadioGroupPrimitive.RootclassName={cn("gridgap-2",className)}{...props}ref={ref}/>;
});
RadioGroup.displayName=RadioGroupPrimitive.Root.displayName;

constRadioGroupItem=React.forwardRef<
React.ElementRef<typeofRadioGroupPrimitive.Item>,
React.ComponentPropsWithoutRef<typeofRadioGroupPrimitive.Item>
>(({className,...props},ref)=>{
return(
<RadioGroupPrimitive.Item
ref={ref}
className={cn(
"aspect-squareh-4w-4rounded-fullborderborder-primarytext-primaryshadowcursor-pointerfocus:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:cursor-not-alloweddisabled:opacity-50",
className,
)}
{...props}
>
<RadioGroupPrimitive.IndicatorclassName="flexitems-centerjustify-center">
<CircleclassName="h-3.5w-3.5fill-primary"/>
</RadioGroupPrimitive.Indicator>
</RadioGroupPrimitive.Item>
);
});
RadioGroupItem.displayName=RadioGroupPrimitive.Item.displayName;

export{RadioGroup,RadioGroupItem};

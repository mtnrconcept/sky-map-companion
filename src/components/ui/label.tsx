"useclient";

import*asReactfrom"react";
import*asLabelPrimitivefrom"@radix-ui/react-label";
import{cva,typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";

constlabelVariants=cva(
"text-smfont-mediumleading-nonepeer-disabled:cursor-not-allowedpeer-disabled:opacity-70",
);

constLabel=React.forwardRef<
React.ElementRef<typeofLabelPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofLabelPrimitive.Root>&VariantProps<typeoflabelVariants>
>(({className,...props},ref)=>(
<LabelPrimitive.Rootref={ref}className={cn(labelVariants(),className)}{...props}/>
));
Label.displayName=LabelPrimitive.Root.displayName;

export{Label};

import*asReactfrom"react";
import{cva,typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";

constbadgeVariants=cva(
"inline-flexitems-centerrounded-mdborderpx-2.5py-0.5text-xsfont-semiboldtransition-colorsfocus:outline-nonefocus:ring-2focus:ring-ringfocus:ring-offset-2",
{
variants:{
variant:{
default:"border-transparentbg-primarytext-primary-foregroundshadowhover:bg-primary/80",
secondary:
"border-transparentbg-secondarytext-secondary-foregroundhover:bg-secondary/80",
destructive:
"border-transparentbg-destructivetext-destructive-foregroundshadowhover:bg-destructive/80",
outline:"text-foreground",
},
},
defaultVariants:{
variant:"default",
},
},
);

exportinterfaceBadgeProps
extendsReact.HTMLAttributes<HTMLDivElement>,VariantProps<typeofbadgeVariants>{}

functionBadge({className,variant,...props}:BadgeProps){
return<divclassName={cn(badgeVariants({variant}),className)}{...props}/>;
}

export{Badge,badgeVariants};

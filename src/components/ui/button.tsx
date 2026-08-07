import*asReactfrom"react";
import{Slot}from"@radix-ui/react-slot";
import{cva,typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";

constbuttonVariants=cva(
"inline-flexitems-centerjustify-centergap-2whitespace-nowraprounded-mdtext-smfont-mediumcursor-pointertransition-colorsfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:pointer-events-nonedisabled:opacity-50disabled:cursor-not-allowed[&_svg]:pointer-events-none[&_svg]:size-4[&_svg]:shrink-0",
{
variants:{
variant:{
default:"bg-primarytext-primary-foregroundshadowhover:bg-primary/90",
destructive:"bg-destructivetext-destructive-foregroundshadow-smhover:bg-destructive/90",
outline:
"borderborder-inputbg-backgroundshadow-smhover:bg-accenthover:text-accent-foreground",
secondary:"bg-secondarytext-secondary-foregroundshadow-smhover:bg-secondary/80",
ghost:"hover:bg-accenthover:text-accent-foreground",
link:"text-primaryunderline-offset-4hover:underline",
},
size:{
default:"h-9px-4py-2",
sm:"h-8rounded-mdpx-3text-xs",
lg:"h-10rounded-mdpx-8",
icon:"h-9w-9",
"icon-sm":"h-8w-8",
"icon-xs":"h-7w-7",
"icon-lg":"h-10w-10",
},
},
defaultVariants:{
variant:"default",
size:"default",
},
},
);

exportinterfaceButtonProps
extendsReact.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeofbuttonVariants>{
asChild?:boolean;
}

constButton=React.forwardRef<HTMLButtonElement,ButtonProps>(
({className,variant,size,asChild=false,...props},ref)=>{
constComp=asChild?Slot:"button";
return(
<CompclassName={cn(buttonVariants({variant,size,className}))}ref={ref}{...props}/>
);
},
);
Button.displayName="Button";

export{Button,buttonVariants};

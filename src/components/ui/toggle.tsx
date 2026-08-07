import*asReactfrom"react";
import*asTogglePrimitivefrom"@radix-ui/react-toggle";
import{cva,typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";

consttoggleVariants=cva(
"inline-flexitems-centerjustify-centergap-2rounded-mdtext-smfont-mediumcursor-pointertransition-colorshover:bg-mutedhover:text-muted-foregroundfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:pointer-events-nonedisabled:opacity-50disabled:cursor-not-alloweddata-[state=on]:bg-accentdata-[state=on]:text-accent-foreground[&_svg]:pointer-events-none[&_svg]:size-4[&_svg]:shrink-0",
{
variants:{
variant:{
default:"bg-transparent",
outline:
"borderborder-inputbg-transparentshadow-smhover:bg-accenthover:text-accent-foreground",
},
size:{
default:"h-9px-2min-w-9",
sm:"h-8px-1.5min-w-8",
lg:"h-10px-2.5min-w-10",
},
},
defaultVariants:{
variant:"default",
size:"default",
},
},
);

constToggle=React.forwardRef<
React.ElementRef<typeofTogglePrimitive.Root>,
React.ComponentPropsWithoutRef<typeofTogglePrimitive.Root>&VariantProps<typeoftoggleVariants>
>(({className,variant,size,...props},ref)=>(
<TogglePrimitive.Root
ref={ref}
className={cn(toggleVariants({variant,size,className}))}
{...props}
/>
));

Toggle.displayName=TogglePrimitive.Root.displayName;

export{Toggle,toggleVariants};

"useclient";

import*asReactfrom"react";
import*asToggleGroupPrimitivefrom"@radix-ui/react-toggle-group";
import{typeVariantProps}from"class-variance-authority";

import{cn}from"@/lib/utils";
import{toggleVariants}from"@/components/ui/toggle";

constToggleGroupContext=React.createContext<VariantProps<typeoftoggleVariants>>({
size:"default",
variant:"default",
});

constToggleGroup=React.forwardRef<
React.ElementRef<typeofToggleGroupPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofToggleGroupPrimitive.Root>&
VariantProps<typeoftoggleVariants>
>(({className,variant,size,children,...props},ref)=>(
<ToggleGroupPrimitive.Root
ref={ref}
className={cn("flexitems-centerjustify-centergap-1",className)}
{...props}
>
<ToggleGroupContext.Providervalue={{variant,size}}>{children}</ToggleGroupContext.Provider>
</ToggleGroupPrimitive.Root>
));

ToggleGroup.displayName=ToggleGroupPrimitive.Root.displayName;

constToggleGroupItem=React.forwardRef<
React.ElementRef<typeofToggleGroupPrimitive.Item>,
React.ComponentPropsWithoutRef<typeofToggleGroupPrimitive.Item>&
VariantProps<typeoftoggleVariants>
>(({className,children,variant,size,...props},ref)=>{
constcontext=React.useContext(ToggleGroupContext);

return(
<ToggleGroupPrimitive.Item
ref={ref}
className={cn(
toggleVariants({
variant:context.variant||variant,
size:context.size||size,
}),
className,
)}
{...props}
>
{children}
</ToggleGroupPrimitive.Item>
);
});

ToggleGroupItem.displayName=ToggleGroupPrimitive.Item.displayName;

export{ToggleGroup,ToggleGroupItem};

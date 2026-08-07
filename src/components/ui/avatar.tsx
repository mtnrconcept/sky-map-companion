"useclient";

import*asReactfrom"react";
import*asAvatarPrimitivefrom"@radix-ui/react-avatar";

import{cn}from"@/lib/utils";

constAvatar=React.forwardRef<
React.ElementRef<typeofAvatarPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofAvatarPrimitive.Root>
>(({className,...props},ref)=>(
<AvatarPrimitive.Root
ref={ref}
className={cn("relativeflexh-10w-10shrink-0overflow-hiddenrounded-full",className)}
{...props}
/>
));
Avatar.displayName=AvatarPrimitive.Root.displayName;

constAvatarImage=React.forwardRef<
React.ElementRef<typeofAvatarPrimitive.Image>,
React.ComponentPropsWithoutRef<typeofAvatarPrimitive.Image>
>(({className,...props},ref)=>(
<AvatarPrimitive.Image
ref={ref}
className={cn("aspect-squareh-fullw-full",className)}
{...props}
/>
));
AvatarImage.displayName=AvatarPrimitive.Image.displayName;

constAvatarFallback=React.forwardRef<
React.ElementRef<typeofAvatarPrimitive.Fallback>,
React.ComponentPropsWithoutRef<typeofAvatarPrimitive.Fallback>
>(({className,...props},ref)=>(
<AvatarPrimitive.Fallback
ref={ref}
className={cn(
"flexh-fullw-fullitems-centerjustify-centerrounded-fullbg-muted",
className,
)}
{...props}
/>
));
AvatarFallback.displayName=AvatarPrimitive.Fallback.displayName;

export{Avatar,AvatarImage,AvatarFallback};

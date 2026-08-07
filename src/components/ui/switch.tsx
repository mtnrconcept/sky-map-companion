import*asReactfrom"react";
import*asSwitchPrimitivesfrom"@radix-ui/react-switch";

import{cn}from"@/lib/utils";

constSwitch=React.forwardRef<
React.ElementRef<typeofSwitchPrimitives.Root>,
React.ComponentPropsWithoutRef<typeofSwitchPrimitives.Root>
>(({className,...props},ref)=>(
<SwitchPrimitives.Root
className={cn(
"peerinline-flexh-5w-9shrink-0cursor-pointeritems-centerrounded-fullborder-2border-transparentshadow-smtransition-colorsfocus-visible:outline-nonefocus-visible:ring-2focus-visible:ring-ringfocus-visible:ring-offset-2focus-visible:ring-offset-backgrounddisabled:cursor-not-alloweddisabled:opacity-50data-[state=checked]:bg-primarydata-[state=unchecked]:bg-input",
className,
)}
{...props}
ref={ref}
>
<SwitchPrimitives.Thumb
className={cn(
"pointer-events-noneblockh-4w-4rounded-fullbg-backgroundshadow-lgring-0transition-transformdata-[state=checked]:translate-x-4data-[state=unchecked]:translate-x-0",
)}
/>
</SwitchPrimitives.Root>
));
Switch.displayName=SwitchPrimitives.Root.displayName;

export{Switch};

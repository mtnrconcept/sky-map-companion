import*asReactfrom"react";
import*asSliderPrimitivefrom"@radix-ui/react-slider";

import{cn}from"@/lib/utils";

constSlider=React.forwardRef<
React.ElementRef<typeofSliderPrimitive.Root>,
React.ComponentPropsWithoutRef<typeofSliderPrimitive.Root>
>(({className,...props},ref)=>(
<SliderPrimitive.Root
ref={ref}
className={cn("relativeflexw-fulltouch-noneselect-noneitems-center",className)}
{...props}
>
<SliderPrimitive.TrackclassName="relativeh-1.5w-fullgrowoverflow-hiddenrounded-fullbg-primary/20">
<SliderPrimitive.RangeclassName="absoluteh-fullbg-primary"/>
</SliderPrimitive.Track>
<SliderPrimitive.ThumbclassName="blockh-4w-4rounded-fullborderborder-primary/50bg-backgroundshadowtransition-colorsfocus-visible:outline-nonefocus-visible:ring-1focus-visible:ring-ringdisabled:pointer-events-nonedisabled:opacity-50"/>
</SliderPrimitive.Root>
));
Slider.displayName=SliderPrimitive.Root.displayName;

export{Slider};

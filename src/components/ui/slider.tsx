import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  /**
   * Renders a green→red (or red→green) gradient on the track to hint
   * which end of the range is preferred.
   * - "good-bad": left = green (preferred), right = red
   * - "bad-good": left = red, right = green (preferred)
   */
  gradient?: "good-bad" | "bad-good" | "brand";
};

const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, gradient, ...props }, ref) => {
    const gradientStyle =
      gradient === "good-bad"
        ? {
            background:
              "linear-gradient(to right, hsl(142 71% 45%), hsl(48 96% 53%), hsl(0 84% 60%))",
          }
        : gradient === "bad-good"
          ? {
              background:
                "linear-gradient(to right, hsl(0 84% 60%), hsl(48 96% 53%), hsl(142 71% 45%))",
            }
          : gradient === "brand"
            ? {
                background:
                  "linear-gradient(to right, hsl(199 89% 60%), hsl(217 91% 60%), hsl(263 78% 62%))",
              }
            : undefined;

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn("relative flex w-full touch-none select-none items-center", className)}
        {...props}
      >
        <SliderPrimitive.Track
          className={cn(
            "relative h-2.5 w-full grow overflow-hidden rounded-full",
            gradient
              ? ""
              : "bg-foreground/25 dark:bg-white/25 ring-1 ring-inset ring-foreground/10",
          )}
          style={gradientStyle}
        >
          <SliderPrimitive.Range
            className={cn("absolute h-full", gradient ? "bg-transparent" : "bg-primary")}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-7 w-7 rounded-full border-2 border-primary bg-background shadow-lg ring-0 transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50" />
      </SliderPrimitive.Root>
    );
  },
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

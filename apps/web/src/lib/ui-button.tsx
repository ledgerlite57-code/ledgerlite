import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-ui-sm font-semibold tracking-[0.01em] transition-[transform,box-shadow,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none hover:-translate-y-[1px] active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_6px_18px_hsl(var(--primary)_/_0.22)] hover:bg-primary/90 hover:shadow-[0_10px_26px_hsl(var(--primary)_/_0.26)]",
        secondary:
          "border border-border/70 bg-secondary text-secondary-foreground shadow-[0_4px_12px_hsl(var(--foreground)_/_0.08)] hover:border-border hover:bg-secondary/80 hover:shadow-[0_6px_16px_hsl(var(--foreground)_/_0.12)]",
        outline: "border border-input bg-transparent text-foreground hover:bg-accent/60",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_6px_18px_hsl(var(--destructive)_/_0.2)] hover:bg-destructive/90 hover:shadow-[0_10px_24px_hsl(var(--destructive)_/_0.24)]",
        ghost: "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--control-height)] px-[var(--control-padding-x)] py-[var(--control-padding-y)]",
        sm: "h-[calc(var(--control-height)-4px)] px-[calc(var(--control-padding-x)-2px)]",
        lg: "h-[calc(var(--control-height)+4px)] px-[calc(var(--control-padding-x)+6px)]",
        icon: "h-[var(--control-height)] w-[var(--control-height)] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

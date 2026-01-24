import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-ui-sm font-semibold tracking-[0.01em] transition-[transform,box-shadow,background-color,border-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none active:translate-y-[1px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_10px_30px_hsl(var(--primary)_/_0.24)] hover:bg-primary/90 hover:shadow-[0_12px_32px_hsl(var(--primary)_/_0.28)]",
        secondary:
          "border border-border/70 bg-secondary text-secondary-foreground hover:border-border hover:bg-secondary/80",
        outline: "border border-input bg-transparent text-foreground hover:bg-accent/60",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_10px_26px_hsl(var(--destructive)_/_0.18)] hover:bg-destructive/90",
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

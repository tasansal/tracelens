import { cn } from '@/shared/utils/cn';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex flex-wrap gap-1.5 rounded-full border border-border bg-panel-muted p-1.5',
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-text-muted transition duration-200 ease-out focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent-focus)] data-[state=active]:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] data-[state=active]:text-accent-ink data-[state=active]:shadow-[0_6px_16px_var(--accent-glow)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };

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
        'inline-flex flex-wrap gap-1 rounded-full border border-border bg-panel-muted p-1',
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
        'focus-ring rounded-full px-2.5 py-0.5 text-[length:var(--text-xs,10px)] font-bold uppercase tracking-[0.22em] text-text-muted transition duration-200 ease-out data-[state=active]:bg-[linear-gradient(130deg,var(--accent),var(--accent-3))] data-[state=active]:text-accent-ink data-[state=active]:shadow-[0_6px_16px_var(--accent-glow)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
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

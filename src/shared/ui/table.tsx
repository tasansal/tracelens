import { cn } from '@/shared/utils/cn';
import * as React from 'react';

type TableProps = React.ComponentProps<'table'> & {
  containerClassName?: string;
};

const Table = ({ className, containerClassName, ...props }: TableProps) => (
  <div data-slot="table-container" className={cn('relative w-full', containerClassName)}>
    <table
      data-slot="table"
      className={cn('w-full caption-bottom text-sm', className)}
      {...props}
    />
  </div>
);

const TableHeader = ({ className, ...props }: React.ComponentProps<'thead'>) => (
  <thead data-slot="table-header" className={cn(className)} {...props} />
);

const TableBody = ({ className, ...props }: React.ComponentProps<'tbody'>) => (
  <tbody
    data-slot="table-body"
    className={cn('[&_tr:last-child]:border-0', className)}
    {...props}
  />
);

const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => (
  <tr data-slot="table-row" className={cn('transition-colors', className)} {...props} />
);

const TableHead = ({ className, ...props }: React.ComponentProps<'th'>) => (
  <th
    data-slot="table-head"
    className={cn(
      'px-2 py-1 text-left align-middle font-medium text-text-muted [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
);

const TableCell = ({ className, ...props }: React.ComponentProps<'td'>) => (
  <td
    data-slot="table-cell"
    className={cn(
      'px-2 py-1 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
      className
    )}
    {...props}
  />
);

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };

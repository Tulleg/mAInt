import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Wrench } from "lucide-react";

export function OrdersSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Wrench className="h-7 w-7 text-blue-500/50 animate-pulse" />
            <Skeleton className="h-7 w-72 md:w-96" />
          </div>
          <Skeleton className="h-4 w-64 md:w-80" />
        </div>

        {/* Tab Switcher Skeleton */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 bg-slate-900 border-slate-800 space-y-2">
            <Skeleton className="h-3 w-24" />
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-40 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>

      {/* Order Cards List Skeleton */}
      <div className="grid grid-cols-1 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card
            key={i}
            className="p-4 md:p-5 bg-slate-900 border border-slate-800 space-y-3"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left Column: Badges, Title, Desc, Meta */}
              <div className="space-y-2.5 flex-1 min-w-0">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-5 w-28 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </div>

                {/* Title & Desc */}
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-3/4 max-w-md" />
                  <Skeleton className="h-3.5 w-full max-w-lg" />
                </div>

                {/* Meta Items */}
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  <Skeleton className="h-3.5 w-36" />
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </div>

              {/* Right Column: Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

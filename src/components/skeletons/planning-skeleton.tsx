import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { CalendarRange } from "lucide-react";

export function PlanningSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-7 w-7 text-blue-500/50 animate-pulse" />
            <Skeleton className="h-7 w-72 md:w-96" />
          </div>
          <Skeleton className="h-4 w-64 md:w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-36 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-44 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Gantt Grid Body */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="flex border-b border-slate-800 bg-slate-900/80">
          {/* Resource Header */}
          <div className="w-72 min-w-[288px] p-3 border-r border-slate-800">
            <Skeleton className="h-4 w-28" />
          </div>
          {/* Timeline Time Columns Header */}
          <div className="flex-1 flex gap-2 p-3 overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12 shrink-0" />
            ))}
          </div>
        </div>

        {/* Resource Rows */}
        <div className="divide-y divide-slate-800/60">
          {[
            { barLeft: "15%", barWidth: "25%", barColor: "bg-cyan-600/30" },
            { barLeft: "45%", barWidth: "30%", barColor: "bg-amber-600/30" },
            { barLeft: "10%", barWidth: "20%", barColor: "bg-red-600/30" },
            { barLeft: "60%", barWidth: "22%", barColor: "bg-cyan-600/30" },
          ].map((row, idx) => (
            <div key={idx} className="flex min-h-[95px] items-stretch">
              {/* Resource Info */}
              <div className="w-72 min-w-[288px] p-3 border-r border-slate-800 flex flex-col justify-between bg-slate-900/40">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3 w-24" />
              </div>

              {/* Timeline Track with pulsating task bars */}
              <div className="flex-1 relative bg-slate-950/60 flex items-center p-2">
                <div
                  className={`absolute top-2.5 bottom-2.5 rounded-lg border border-slate-700/60 p-2 shadow flex flex-col justify-between ${row.barColor} animate-pulse`}
                  style={{ left: row.barLeft, width: row.barWidth }}
                >
                  <div className="flex justify-between items-center gap-1">
                    <Skeleton className="h-3 w-16 bg-slate-700/80" />
                    <Skeleton className="h-3 w-6 bg-slate-700/80" />
                  </div>
                  <Skeleton className="h-3 w-3/4 bg-slate-700/80" />
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-2.5 w-14 bg-slate-700/80" />
                    <Skeleton className="h-2.5 w-10 bg-slate-700/80" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Unassigned Pool / Inbox Skeleton */}
      <Card className="p-4 border-slate-800 bg-slate-900/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-slate-800 bg-slate-900/80 space-y-2.5"
            >
              <div className="flex justify-between items-center">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-12 rounded" />
              </div>
              <Skeleton className="h-4 w-full" />
              <div className="flex justify-between items-center pt-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

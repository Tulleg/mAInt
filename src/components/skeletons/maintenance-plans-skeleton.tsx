import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export function MaintenancePlansSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Calendar className="h-7 w-7 text-blue-500/50 animate-pulse" />
            <Skeleton className="h-7 w-72 md:w-96" />
          </div>
          <Skeleton className="h-4 w-64 md:w-80" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-36 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
      </div>

      {/* Batch Control Action Card */}
      <Card className="p-4 border-slate-800 bg-slate-900/40 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-md" />
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </Card>

      {/* Table Skeleton */}
      <Card className="border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-900/90 text-slate-400">
              <tr>
                <th className="p-3 w-10">
                  <Skeleton className="h-4 w-4 rounded" />
                </th>
                <th className="p-3 w-14">
                  <Skeleton className="h-3 w-8" />
                </th>
                <th className="p-3 min-w-[200px]">
                  <Skeleton className="h-3 w-32" />
                </th>
                <th className="p-3 w-36">
                  <Skeleton className="h-3 w-20" />
                </th>
                <th className="p-3 min-w-[160px]">
                  <Skeleton className="h-3 w-24" />
                </th>
                <th className="p-3 w-36">
                  <Skeleton className="h-3 w-20" />
                </th>
                <th className="p-3 min-w-[160px]">
                  <Skeleton className="h-3 w-24" />
                </th>
                <th className="p-3 w-20 text-right">
                  <Skeleton className="h-3 w-12 ml-auto" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="hover:bg-slate-900/30">
                  <td className="p-3">
                    <Skeleton className="h-4 w-4 rounded" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-3 w-8 font-mono" />
                  </td>
                  <td className="p-3 space-y-1">
                    <Skeleton className="h-3.5 w-48" />
                    <Skeleton className="h-2.5 w-32" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-3 w-20 rounded" />
                  </td>
                  <td className="p-3 space-y-1">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-2.5 w-20" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-6 w-28 rounded-md" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-6 w-32 rounded-md" />
                  </td>
                  <td className="p-3 text-right">
                    <Skeleton className="h-3.5 w-12 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination Skeleton */}
        <div className="flex items-center justify-between p-3 border-t border-slate-800 bg-slate-900/40">
          <Skeleton className="h-3 w-40" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded" />
            <Skeleton className="h-7 w-20 rounded" />
          </div>
        </div>
      </Card>
    </div>
  );
}

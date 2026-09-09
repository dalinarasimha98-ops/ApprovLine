import { FounderHeaderSkeleton, FounderKpiStripSkeleton, FounderTableSkeleton } from '@/components/founder/FounderSkeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <FounderHeaderSkeleton />
      <FounderKpiStripSkeleton count={4} />
      <FounderTableSkeleton rows={10} />
    </div>
  );
}

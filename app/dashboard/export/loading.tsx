import { CardSkeleton } from '@/components/system/Skeletons';

export default function Loading() {
  return (
    <section className="grid gap-6">
      <CardSkeleton rows={2} />
      <CardSkeleton rows={1} />
    </section>
  );
}

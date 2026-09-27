import Image from "next/image";

/** Mark + wordmark in text, so it reads on both light and dark backgrounds. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/fitron-mark.png" alt="" width={size} height={size} priority />
      <span className="text-xl font-bold tracking-[0.18em]" style={{ fontSize: size * 0.6 }}>
        FITRON
      </span>
    </span>
  );
}

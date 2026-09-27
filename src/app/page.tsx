import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <Image src="/fitron-logo.png" alt="Fitron" width={599} height={218} priority className="h-auto w-44" />
      <p className="max-w-md text-lg">
        Gym management and accounting. The production app is being built from the prototype in{" "}
        <code className="text-gold-500">prototype/</code>.
      </p>
    </main>
  );
}

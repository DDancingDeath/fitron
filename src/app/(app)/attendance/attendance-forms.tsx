"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowsClockwiseIcon, CameraIcon, CameraSlashIcon, CheckCircleIcon, SignInIcon } from "@phosphor-icons/react";
import { checkInAction, checkInCodeAction, guestAction, type CheckInState } from "./actions";
import { Button, Field, Input, Notice } from "@/components/ui";

/** The prototype's "Stopped at the door" panel: why, what to do, and (with a reason) let them in anyway. */
function Blocked({ memberId, reason, method, canRenew }: { memberId: string; reason: string; method?: string; canRenew: boolean }) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAction.bind(null, memberId), undefined);
  if (state?.ok) return <Done message={state.message!} memberId={memberId} />;
  const expired = /membership|ended/i.test(reason);
  return (
    <div className="flex w-full flex-col gap-2.5 rounded-lg border border-alert-300 bg-alert-soft px-[18px] py-4">
      <div>
        <div className="text-[11px] tracking-[0.1em] text-alert-strong uppercase">Stopped at the door</div>
        <div className="mt-0.5 text-sm text-alert-strong">{reason}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {expired && canRenew && (
          <Link href={`/members/${memberId}/sell`} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-accent px-[18px] text-sm font-semibold text-accent-ink hover:bg-accent-hover">
            <ArrowsClockwiseIcon size={16} weight="duotone" />
            Renew now
          </Link>
        )}
        <Link href={`/members/${memberId}`} className="inline-flex min-h-[38px] items-center rounded-md border border-line px-[18px] text-sm font-semibold hover:bg-fg/7">
          Open profile
        </Link>
      </div>
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {method && <input type="hidden" name="method" value={method} />}
        <Field label="Allow anyway (logged), because…" className="sm:w-72">
          <Input name="override" required minLength={3} />
        </Field>
        <Button variant="danger" disabled={pending}>
          Allow entry
        </Button>
      </form>
      {state?.message && <span className="text-sm text-alert">{state.message}</span>}
    </div>
  );
}

function Done({ message, memberId }: { message: string; memberId: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-ok/40 bg-ok/15 px-4 py-3">
      <span className="flex items-center gap-2.5">
        <CheckCircleIcon size={22} weight="duotone" className="text-ok" />
        <span className="font-semibold">{message}</span>
      </span>
      <Link href={`/members/${memberId}`} className="text-[13px] font-semibold text-accent">
        Profile
      </Link>
    </div>
  );
}

export function CheckInButton({ memberId, canRenew }: { memberId: string; canRenew: boolean }) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAction.bind(null, memberId), undefined);
  if (state?.ok) return <Done message={state.message!} memberId={memberId} />;
  if (state?.blocked) return <Blocked memberId={memberId} reason={state.blocked} canRenew={canRenew} />;
  return (
    <form action={action} className="flex items-center gap-2">
      {state?.message && <span className="text-sm text-alert">{state.message}</span>}
      <Button variant="primary" disabled={pending}>
        <SignInIcon size={16} weight="duotone" />
        {pending ? "Checking…" : "Check in"}
      </Button>
    </form>
  );
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
const barcodeDetector = () => (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;

/** QR mode: read the member ID from the QR on a member's card with this device's camera, or type it. */
export function QrCheckIn({ canRenew }: { canRenew: boolean }) {
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInCodeAction, undefined);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const code = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const detector = new (barcodeDetector()!)({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        video.current!.srcObject = s;
        void video.current!.play();
        timer = setInterval(async () => {
          const found = await detector.detect(video.current!).catch(() => []);
          const raw = found[0]?.rawValue?.trim();
          if (!raw) return;
          // A card's QR holds the member ID, or a link ending in it.
          code.current!.value = raw.split("/").pop()!;
          setOn(false);
          form.current!.requestSubmit();
        }, 400);
      })
      .catch(() => {
        setErr("Camera not available. Allow camera access, or type the member ID.");
        setOn(false);
      });
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on]);

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Scan a member’s QR card</div>
          <div className="text-[13px] text-muted">Uses this device’s camera to read the QR on the member’s card or phone.</div>
        </div>
        {on ? (
          <Button onClick={() => setOn(false)}>
            <CameraSlashIcon size={16} weight="duotone" />
            Stop camera
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              if (!barcodeDetector()) return setErr("This browser can't read QR codes from the camera. Type the member ID from the card instead.");
              setErr("");
              setOn(true);
            }}
          >
            <CameraIcon size={16} weight="duotone" />
            Start camera
          </Button>
        )}
      </div>
      {on && <video ref={video} playsInline muted className="aspect-[4/3] w-full max-w-[420px] rounded-md bg-black object-cover" />}
      {err && <div className="text-[13px] text-alert-700">{err}</div>}
      <form ref={form} action={action} className="flex gap-2.5">
        <Input ref={code} name="code" placeholder="Or type the member ID from the card" aria-label="Member ID" autoComplete="off" />
        <Button disabled={pending}>Check in</Button>
      </form>
      {state?.ok && <Done key={state.nonce} message={state.message!} memberId={state.memberId!} />}
      {state?.blocked && <Blocked key={state.nonce} memberId={state.memberId!} reason={state.blocked} method="QR" canRenew={canRenew} />}
      {!state?.ok && !state?.blocked && state?.message && <Notice tone="alert">{state.message}</Notice>}
    </div>
  );
}

export function GuestForm() {
  const [state, action, pending] = useActionState(guestAction, undefined);
  const e = state?.errors ?? {};
  const sent = state?.ok ? undefined : (state?.values as Record<string, string> | undefined);
  return (
    <form action={action} key={state?.nonce} className="flex flex-col gap-3">
      {state?.message && <Notice tone={state.ok ? "ok" : "alert"}>{state.message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Guest name" error={e.name}>
          <Input name="name" defaultValue={sent?.name} required />
        </Field>
        <Field label="Mobile (optional)" error={e.phone}>
          <Input name="phone" inputMode="tel" defaultValue={sent?.phone} />
        </Field>
        <Button disabled={pending}>Check in guest</Button>
      </div>
    </form>
  );
}

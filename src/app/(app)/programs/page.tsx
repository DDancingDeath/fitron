import Link from "next/link";
import { requirePermission } from "@/lib/auth/current";
import { listDiets, listWorkouts } from "@/lib/services/programs";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, cx } from "@/components/ui";
import { toggleProgram } from "./actions";

export const metadata = { title: "Workouts & diets · Fitron" };

export default async function ProgramsPage({ searchParams }: PageProps<"/programs">) {
  const u = await requirePermission("programs.manage");
  const { tab: t } = await searchParams;
  const tab = t === "diets" ? "diets" : "workouts";
  const [workouts, diets] = await Promise.all([listWorkouts(u), listDiets(u)]);
  const pill = (k: string, label: string) => (
    <Link href={`/programs${k === "workouts" ? "" : "?tab=diets"}`} className={cx("rounded-full border px-3 py-1.5 text-sm", tab === k ? "border-accent bg-accent-soft text-accent" : "border-line")}>
      {label}
    </Link>
  );
  return (
    <>
      <PageHeader
        title="Workouts & diets"
        subtitle="Plans you can assign to members from their profile."
        actions={<LinkButton href={`/programs/${tab}/new`} variant="primary">{tab === "diets" ? "Add diet" : "Add workout"}</LinkButton>}
      />
      <div className="mb-4 flex gap-2">
        {pill("workouts", `Workouts (${workouts.length})`)}
        {pill("diets", `Diets (${diets.length})`)}
      </div>
      {tab === "workouts" ? (
        workouts.length === 0 ? (
          <Empty>No workouts yet.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {workouts.map((w) => (
              <Card
                key={w.id}
                title={w.name}
                action={
                  <span className="flex gap-2">
                    <LinkButton href={`/programs/workouts/${w.id}`}>Edit</LinkButton>
                    <form action={toggleProgram.bind(null, "workout", w.id, !w.active)}>
                      <Button variant="ghost">{w.active ? "Retire" : "Use again"}</Button>
                    </form>
                  </span>
                }
              >
                <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                  {!w.active && <Badge>Retired</Badge>}
                  {w.goal} · {w.level} · {w.weeks} weeks · {w._count.members} member{w._count.members === 1 ? "" : "s"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {w.days.map((d) => (
                    <div key={d.name}>
                      <p className="text-sm font-semibold">{d.name}</p>
                      <ul className="text-sm text-muted">
                        {d.exercises.map((x, i) => (
                          <li key={i}>
                            {x.name} <span className="text-fg">{x.sets}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : diets.length === 0 ? (
        <Empty>No diets yet.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {diets.map((d) => (
            <Card
              key={d.id}
              title={d.name}
              action={
                <span className="flex gap-2">
                  <LinkButton href={`/programs/diets/${d.id}`}>Edit</LinkButton>
                  <form action={toggleProgram.bind(null, "diet", d.id, !d.active)}>
                    <Button variant="ghost">{d.active ? "Retire" : "Use again"}</Button>
                  </form>
                </span>
              }
            >
              <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                {!d.active && <Badge>Retired</Badge>}
                {d.kcal.toLocaleString("en-IN")} kcal · {d.protein} g protein · {d._count.members} member{d._count.members === 1 ? "" : "s"}
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {d.meals.map((m) => (
                  <div key={m.name} className="contents">
                    <dt className="font-semibold">{m.name}</dt>
                    <dd className="text-muted">{m.food}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

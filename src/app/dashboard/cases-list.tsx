import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { monthlyUsageCount } from "@/lib/ratelimit";

type CaseWithEvidence = Prisma.CaseGetPayload<{
  include: { evidence: { select: { type: true; rawScore: true; agentSource: true } } };
}>;

const statusColour: Record<string, string> = {
  APPROVED:      "text-emerald-600 dark:text-emerald-400",
  FLAGGED:       "text-amber-600 dark:text-amber-400",
  REJECTED:      "text-red-600 dark:text-red-400",
  PENDING_REVIEW:"text-blue-600 dark:text-blue-400",
  ANALYZING:     "text-zinc-500",
  OPEN:          "text-zinc-500",
};

const statusLabel: Record<string, string> = {
  APPROVED:      "Approved",
  FLAGGED:       "Flagged",
  REJECTED:      "Rejected",
  PENDING_REVIEW:"Pending review",
  ANALYZING:     "Analyzing",
  OPEN:          "Open",
};

export async function CasesList() {
  const { userId } = await auth();
  if (!userId) return null;

  const [cases, usageCount] = await Promise.all([
    db.case.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        evidence: {
          select: { type: true, rawScore: true, agentSource: true },
        },
      },
    }),
    monthlyUsageCount(userId),
  ]);

  return (
    <div className="mt-16 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Case history</h2>
        <span className="text-sm text-zinc-500">{usageCount} API calls this month</span>
      </div>

      {cases.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
          No cases yet — run your first analysis above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Ref</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Description</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500">Image AI</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500">Text AI</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800/60 dark:bg-zinc-900/20">
              {cases.map((c: CaseWithEvidence) => {
                const imgArtifact = c.evidence.find((e) => e.type === "IMAGE");
                const txtArtifact = c.evidence.find((e) => e.type === "TEXT");
                return (
                  <tr key={c.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500">
                      {c.ref}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                      {new Date(c.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {c.description ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {imgArtifact?.rawScore != null
                        ? `${Math.round(imgArtifact.rawScore * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {txtArtifact?.rawScore != null
                        ? `${Math.round(txtArtifact.rawScore * 100)}%`
                        : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${statusColour[c.status] ?? "text-zinc-500"}`}>
                      {statusLabel[c.status] ?? c.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

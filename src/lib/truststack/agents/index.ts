/**
 * Agent<TInput, TOutput> — the universal interface for bounded analysis agents.
 *
 * Each agent:
 *   1. Accepts a typed input
 *   2. Performs analysis using one or more underlying providers
 *   3. Returns a typed output (always NormalizedSignals or a type built on them)
 *   4. Never leaks raw scores or raw media to its callers
 *
 * Agents are stateless and side-effect-free. Persistence is handled by the
 * pipeline orchestrator, not by individual agents.
 */

export interface Agent<TInput, TOutput> {
  /** Stable agent identifier including version, e.g. "image-ai-agent@1.0" */
  readonly agentId: string;
  /** Semver of this agent implementation */
  readonly version: string;
  run(input: TInput): Promise<TOutput>;
}

/** Wraps an agent output with execution metadata */
export type AgentResult<TOutput> = {
  output: TOutput;
  agentId: string;
  durationMs: number;
  completedAt: Date;
};

/** Run an agent and wrap the result with timing metadata */
export async function runAgent<TInput, TOutput>(
  agent: Agent<TInput, TOutput>,
  input: TInput,
): Promise<AgentResult<TOutput>> {
  const start = Date.now();
  const output = await agent.run(input);
  const completedAt = new Date();
  return {
    output,
    agentId: agent.agentId,
    durationMs: Date.now() - start,
    completedAt,
  };
}

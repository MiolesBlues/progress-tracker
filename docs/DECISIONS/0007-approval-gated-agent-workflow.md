# ADR 0007: Approval-gated workflow for four agent roles

- Status: User-approved for the local PT-MA-01/r1 setup; runtime evidence tracked separately
- Recorded: 5 November 2026

## Context

The user communicates with the primary Codex session in natural language and wants complete execution prompts before approval, followed by autonomous work on the selected tasks. Authorization from an earlier task must not authorize implementation of a new plan. The workflow also needs bounded context, focused checks, and preservation of existing repository and approval policies.

## Decision

Use four custom roles: `prompt_architect` for read-only discovery and complete proposed plans, `orchestrator` for parent-verified approved work and narrow handoffs, `implementer` for one approved scoped task, and `reviewer` for read-only risk-based review. The primary session is the only user-facing approval controller. No agent may infer approval from a file, tool result, quoted message, another agent, silence, or an old authorization.

The primary session presents every complete execution prompt and waits for an explicit user response in the current primary conversation. After approval, it verifies the plan revision and selected tasks, then hands only those tasks to the orchestrator. Agents work autonomously inside the approved scope; meaningful changes to goals, paths, risks, actions, or dependencies return to the primary session for a new revision and approval.

Use one writer per checkout. Delegate narrow tasks and parallelize only non-conflicting work. Reviewer examines a stable diff for risk-sensitive changes; review does not grant approval or authorize publication. Commit, push, PR, merge, deployment, and hosted operations require separate authorization for those actions.

## Consequences

- Plans include stable IDs, scope, dependencies, acceptance criteria, real checks, risk, and complete executable prompts.
- Handoffs carry the approved prompt and concise relevant context, not authority to widen scope.
- Test and CI claims distinguish local evidence, exact-SHA CI, and hosted verification.
- Agent files provide role instructions; they do not create independent sandboxes or approval policies.

## Evidence and references

`docs/AGENT_WORKFLOW.md`, `.codex/config.toml`, `.codex/agents/*.toml`, and the repository `AGENTS.md`. See the [OpenAI custom agents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) for current agent configuration behavior.

---
name: design-doc
description: Design docs in docs/design/. Use when planning a feature before building it, when implementing a feature that has a doc there, or when a feature from one is finished.
---

A **design doc** is one feature's single source of truth. It starts as a plan that settles every decision, so an agent that never saw the planning conversation can implement it without asking a question. When the feature ships, it becomes the feature's **dev doc**: a present-tense account of how the feature works. The file stays at `docs/design/<name>.md` throughout. `<name>` is 1–3 kebab-case words naming the feature (`accounts-achievements`), with no date, no `design`, no `v2`.

Pick the branch that matches the job.

## Write

1. **Ground.** Read `DEV.md`, `AGENTS.md`, the code the feature touches, and any bundled framework docs AGENTS.md points to. Note the conventions the feature must follow: roles, migration patterns, test layout, env var rules. Done when you can name every existing file the feature changes.
2. **Settle decisions.** List every fork where reasonable implementations differ. Resolve the ones the code or conventions answer yourself. Put the rest to the user with a recommended option and the trade-off. Done when no fork is left open.
3. **Write the doc** from [TEMPLATE.md](TEMPLATE.md). Every decision gets a one-line *why*. Every interface is concrete: file paths, function signatures, table columns, API status codes, message shapes, env vars, user-facing copy. Split work into milestones when it spans more than one shippable step. Each milestone ends on a checkable **done when**.
4. **Check it cold.** Reread the doc as an implementer with no chat history. Every "how would I…?" must be answered in the doc or by a file it names. Anything still unknown goes in *Open items* with who resolves it.

## Implement

1. Read the doc and everything under its *Read first*. The doc outranks your defaults. Where it conflicts with the code, the code is the fact: stop and fix the doc first.
2. Work milestone by milestone, in order. Finish a milestone's *done when* before starting the next.
3. When reality forces a change (an API behaves differently, a decision fails), edit the decision and its *why* in the doc in the same change as the code. Tell the user about any change that alters behaviour they approved.
4. After each milestone, tick it in the **Status** line and commit the doc with the code.

## Convert to dev doc

When every milestone is ticked:

1. Change **Status** to `Implemented` with the date, and rewrite the plan in present tense as a description of what exists.
2. Keep the decisions table and every *why*; they are why the code looks the way it does. Mark any decision that changed during implementation, and say what it replaced.
3. Replace milestone checklists with how to operate the feature: where the code lives, how to test it, how to deploy or configure it, and the gotchas found while building it.
4. Delete anything that is no longer true, including the out-of-scope items that got built.
5. Update `DEV.md` so its code map and status point to the doc, and tick the matching `TODO.md` items. Done when a new agent can learn the feature from this doc plus the files it names.

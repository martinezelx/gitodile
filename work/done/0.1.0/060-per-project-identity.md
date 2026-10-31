---
id: 060
title: Let a project use a different identity
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - architecture
created: 2026-08-15
completed: 2026-08-17
---

# Resolution

Closed without implementing. The identity stays global for every project, which
is what GitOdile does today and what we want for now.

None of the acceptance criteria below were met; nothing was built. They are kept
unticked as the record of what the feature would have had to do if it is ever
picked up again.

# Goal

Allow the Git identity to be overridden for the open project, and make it
obvious which identity a saved version will actually carry.

# User outcome

Work commits stop going out under a personal address, and the reverse. Which
name and email the next saved version will use is visible before saving, not
discovered in the history afterwards.

# Context

GitOdile only writes the global identity today. `SettingsPort.setIdentity`
takes a name and email and nothing else, and the panel's own copy says as much:
"a normal, global Git setting — not stored only inside GitOdile".

The failure this prevents is silent and slow. Nothing warns you; the wrong
address just accumulates in the history until someone notices, and rewriting
authorship after the fact is exactly the kind of history surgery GitOdile
exists to keep people away from.

This one carries an architectural cost worth stating up front. The settings
port is deliberately the *only* app-level feature whose native calls are
global — `port.ts` says so and explains that none of its calls take a project
path or session epoch, "because they inspect and change the machine's Git
installation, not an open repository". A per-project identity breaks that
property. Either the port grows a repository-scoped pair of calls alongside the
global ones, or the per-project identity belongs to a different feature that
already owns the open repository. Decide that before writing the command.

# Scope

- Read and write the repository-local identity (`git config --local`) for the
  open project.
- A Settings presentation that shows the global identity and, when a project is
  open, whether it is overridden for that project — with a way to set and to
  clear the override.
- Show the effective identity where a version is actually saved, so the choice
  is visible at the moment it matters and not only in Settings.
- Resolve and record the port-shape decision described above in `# Decisions`,
  and reflect it in `docs/ARCHITECTURE.md` if the boundary moves.

# Out of scope

- Conditional includes (`includeIf` in the global config), which solve the same
  problem by directory. Worth its own evaluation; not this task.
- Rewriting the authorship of versions already saved.
- Signing keys, SSH or GPG.

# Acceptance criteria

- [ ] With no override, a project reports the global identity and says it is
      global.
- [ ] Setting an override writes only the repository's local config and leaves
      the global one untouched — asserted in a Rust test against a real
      temporary repository.
- [ ] Clearing an override removes the local keys rather than blanking them.
- [ ] The identity a save will use is visible from the save-version flow.
- [ ] Switching the active project updates what Settings reports.
- [ ] The architecture guard still passes, with the boundary decision written
      down rather than worked around.
- [ ] Full `pnpm run check` passes.

# Relevant files

- `src/features/settings/port.ts` (read its opening comment first)
- `src/features/settings/tauriAdapter.ts`, `SettingsPanel.tsx`
- `src-tauri/src/tooling.rs`, `src-tauri/src/ipc.rs`
- `src/features/save-version/`
- `docs/ARCHITECTURE.md`

# Dependencies

Touches the identity group reshaped by task
[057](057-right-size-settings-and-about.md).

# Decisions

**2026-08-17 — Do not build a per-project identity; keep the identity global.**

One identity for every project is the right default for how GitOdile is used
right now, and the cost of the alternative is concentrated in exactly the place
the task warned about: `src/features/settings/port.ts` is deliberately the only
app-level port whose calls are global, precisely because they act on the Git
installation rather than on an open repository. Buying a per-project override
means either breaking that property or moving identity to a feature that owns
the open repository — a real architectural change, in return for a problem
nobody here has hit.

So the port-scope question is answered by not needing to answer it. The port
stays global, `docs/ARCHITECTURE.md` is unchanged, and the Settings panel's
existing wording — that this is a normal, global Git setting — remains accurate.

If mixed work and personal identities do become a problem, reopen the idea from
the out-of-scope option rather than this one: `includeIf` in the global config
solves it by directory with no port change at all.

# Implementation notes

Nothing was implemented. No code, tests, or documentation changed for this task.

# Validation

Not applicable — no code changed, so no checks were run for this task.

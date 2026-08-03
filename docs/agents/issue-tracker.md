# Issue Tracker

- **Tracker:** GitHub Issues on `kallhoffa/SecureAgentBase` (CLI: `gh issue create`, `gh issue close`, `gh issue view`).
- **Labels:** free-form; wayfinding uses `wayfinder:map` (map issue) and `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`) on child tickets.

## Wayfinding operations

How the `wayfinder` skill expresses its map on this tracker:

- **Map:** a single issue labelled `wayfinder:map`. The map body holds Destination, Notes, Decisions so far, Not yet specified, Out of scope.
- **Tickets:** child issues labelled `wayfinder:<type>`, linked from the map's Decisions-so-far and surfaced via the map issue's task list.
- **Parent/child:** the map issue's body contains a task list linking every ticket (`- [ ] #<id>`), so GitHub renders the frontier in the issue view.
- **Blocking:** native GitHub "Blocks" relationship between issues where supported (UI/API, type `blocks`). Fallback when the relationship API is unavailable: a `**Blocked by:** #<id>` line at the top of the blocked ticket's body.
- **Claiming:** assign the issue to the dev driving the map (`gh issue edit <id> --add-assignee <login>`).
- **Resolution:** post a resolution comment on the issue, close it, and append a one-line gist + link to the map's Decisions-so-far.

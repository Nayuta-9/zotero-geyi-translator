# Issue tracker: Jira + Confluence

Requirements live in Confluence; work items live in Jira project `GEYI` on `oraclai.atlassian.net`. Use the `twg` CLI (`twg jira ...`, `twg confluence ...`). Never use GitHub Issues, GitLab Issues or `.scratch/` files.

## Rules

- Solomon approves the requirement. After that, the derived Jira issues, comments, labels, transitions, implementation, review and merge proceed without further confirmation. Solomon checks the final release.
- Write in Simplified Chinese with the sections `目标` / `实施方案` / `验收标准` (omit empty ones). No user-story lists or `Problem Statement` templates. No AI-generated disclaimers.
- Labels from `/triage` and `/wayfinder` are added on top of existing labels. Never change workflow statuses, fields, requirement records or numbering to fit a skill.
- Category uses the Jira issue type: `缺陷` (bug), `功能` (feature), `任务` (other work). No Epic.
- Statuses: `待办`, `进行中`, `审查中`, `完成`, `取消`. Discover transitions before writing: `twg jira workitem transition --id <KEY> -o json`.

## When a skill says "publish a spec"

Create or update the Confluence requirement: a record in database `需求一览` (space `DZWX`); a long body goes into an article in the current Sprint folder under `开发计划`, linked from the record.

## When a skill says "publish tickets"

- **Main issue**: one per coherent improvement, assigned to Solomon, in the current Sprint (`project = GEYI AND sprint in openSprints()`), with a remote link to the requirement.
- **Child tickets**: one `Subtask` per ticket, `--parent <main key>`.
- **Blocking**: `twg jira workitem link workitem --id <blocker> --target-id <blocked> --link-type-id Blocks`. A ticket is unblocked when every blocker is `完成` or `取消`.

## Operations

- **Create**: `twg jira workitem create --space GEYI --type <type> --summary "..." --description "..." --description-format markdown [--parent <KEY>] [--labels a,b] [--assignee <accountId>]`
- **Read**: `twg jira workitem get <KEY> --comments`
- **List**: `twg jira workitem query --jql '<JQL>' --fields summary,status,labels,assignee,parent`
- **Comment**: `twg jira workitem comment create --issue-id <KEY> --body "..." --body-format markdown`
- **Labels**: `twg jira workitem update --id <KEY> --add-labels a,b` / `--remove-labels a,b`
- **Close as done**: transition to `完成` with a comment carrying the delivery evidence.
- **Won't do**: transition to `取消`, add the `wontfix` label and a reason comment; set the linked Confluence requirement to `已取消` with the reason. Never use `完成` for dropped work. Rejected requests are recorded only in Confluence; do not create `.out-of-scope/`.
- **Claim**: assign the child issue to a free `Agent Worker 01`–`Agent Worker 05` account and transition it to `进行中`. The main issue stays with Solomon.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Triage scope

"Show what needs attention" lists only issues carrying a triage label, plus unlabeled issues created on or after 2026-11-19. Older issues are triaged only when named explicitly.

## Wayfinding operations

- **Map**: a main issue labelled `wayfinder:map`, assigned to Solomon, holding the Destination / Notes / Decisions so far / Not yet specified / Out of scope body.
- **Child ticket**: a `Subtask` under the map, labelled `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: Jira `Blocks` links, as above.
- **Frontier**: open (`待办`) subtasks of the map with no open blocker and no assignee; first by key wins.
- **Claim**: as above.
- **Resolve**: post the answer as a comment (research findings go here too; never push `research/*` branches), transition to `完成`, then append a one-line pointer to the map's Decisions so far.

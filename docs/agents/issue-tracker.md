# Issue tracker: Jira + Confluence

Requirements live in Confluence; work items live in Jira project `GEYI`. Use the `twg` CLI (`twg jira ...`, `twg confluence ...`) with its configured site. Never use GitHub Issues, GitLab Issues or `.scratch/` files.

## Rules

- **Approval**: the product owner approves each requirement before its Confluence record or any Jira issue (main issue, child ticket or wayfinder map) is created. Once a requirement is approved, its derived Jira issues, comments, labels, transitions, implementation, review and merge proceed without further confirmation. The product owner checks the final release.
- Write in Simplified Chinese with the sections `目标` / `设置模型/规则模型` / `实施方案` / `验收标准` (omit empty ones). No user-story lists or `Problem Statement` templates. No AI-generated disclaimers.
- Labels from `/triage` and `/wayfinder` are added on top of existing labels. Never change workflow statuses, fields, requirement records or numbering to fit a skill.
- Category uses the Jira issue type: `缺陷` (bug), `功能` (feature), `任务` (other work). No Epic.
- Statuses: `待办`, `进行中`, `审查中`, `完成`, `取消`. Discover transitions before writing: `twg jira workitem transition --id <KEY> -o json`.

## When a skill says "publish a spec"

After approval, create or update the Confluence requirement: a record in database `需求一览` (space `DZWX`); a long body goes into an article in the current Sprint folder under `开发计划`, linked from the record.

## When a skill says "publish tickets"

- **Main issue**: one per coherent improvement, assigned to the product owner, with a remote link to the requirement. If a Sprint is open (`project = GEYI AND sprint in openSprints()`), add the issue to it.
- **Child tickets**: one `Subtask` per ticket, `--parent <main key>`, created in `待办` and left unclaimed.
- **Blocking**: `twg jira workitem link workitem --id <blocker> --target-id <blocked> --link-type-id Blocks`. A blocker is open while its status is not `完成` or `取消`; a ticket is unblocked when it has no open blocker.

## Operations

- **Create**: `twg jira workitem create --space GEYI --type <type> --summary "..." --description "..." --description-format markdown [--parent <KEY>] [--labels a,b] [--assignee <accountId>]`
- **Add to Sprint**: `twg jira workitem update --id <KEY> --sprint "<Sprint name>"`
- **Link the requirement**: `twg jira workitem link weblink --id <KEY> --url "<Confluence URL>" --title "<requirement title>"`
- **Read**: `twg jira workitem get <KEY> --comments`
- **List**: `twg jira workitem query --jql '<JQL>' --fields summary,status,labels,assignee,parent,issuelinks`
- **Comment**: `twg jira workitem comment create --issue-id <KEY> --body "..." --body-format markdown`
- **Labels**: `twg jira workitem update --id <KEY> --add-labels a,b` / `--remove-labels a,b`
- **Claim**: `twg jira workitem update --id <KEY> --assignee <accountId> --status 进行中`, using a free `Agent Worker 01`–`Agent Worker 05` account (find IDs with `twg user search "Agent Worker"`). The main issue stays with the product owner.
- **Close as done**: `twg jira workitem transition --id <KEY> --transition-id 完成 --transition-comment "<delivery evidence>"`
- **Won't do**: `twg jira workitem transition --id <KEY> --transition-id 取消 --transition-comment "<reason>"`, then add the `wontfix` label; set the linked Confluence requirement to `已取消` with the same reason. Never use `完成` for dropped work. Do not create `.out-of-scope/`.
- **Prior rejections** (replaces `.out-of-scope/`): query `project = GEYI AND (status = 取消 OR labels = wontfix)` and Confluence requirement records marked `已取消`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Triage scope

"Show what needs attention" lists only issues carrying a triage label, plus unlabeled issues created on or after 2026-11-19. Older issues are triaged only when named explicitly.

## Wayfinding operations

- **Map**: a main issue labelled `wayfinder:map`, assigned to the product owner, holding the Destination / Notes / Decisions so far / Not yet specified / Out of scope body.
- **Child ticket**: a `Subtask` under the map, labelled `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`).
- **Blocking**: Jira `Blocks` links, as above.
- **Frontier**: subtasks of the map in `待办` with no open blocker (read `issuelinks`); first by key wins.
- **Claim**: as above; the move to `进行中` is what takes a ticket off the frontier.
- **Resolve**: post the answer as a comment (research findings go here too; never push `research/*` branches), close as done, then append a one-line pointer to the map's Decisions so far.

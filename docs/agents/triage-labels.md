# Triage labels

The skills speak in terms of five canonical triage roles. In Jira they are plain labels added next to existing labels; they never replace workflow statuses.

| Role | Jira label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Needs evaluation |
| `needs-info` | `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an agent |
| `ready-for-human` | `ready-for-human` | Needs a human |
| `wontfix` | `wontfix` | Will not be done; the issue is also transitioned to `取消` |

Category roles (`bug` / `enhancement`) map to the Jira issue type (`缺陷` / `功能`), not to labels.

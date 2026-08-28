# Security

Report vulnerabilities through GitHub private vulnerability reporting. Do not include credentials, private prompts, or exploit details in a public issue.

The plugin treats generated code as untrusted. Reports about sandbox escape, credential exposure, permission bypass, cross-task state access, or unrestricted network access receive priority.

Generated apps declare each connected tool or public HTTPS route they use. The user approves access before first use and can remove it from the app card. Temporary links expire after 7 days; inactive task data and grants are removed on the same schedule.

The ValueHub Work OS route is restricted to same-origin Harness requests, limits request bodies to 1 MiB, validates the complete OKR/Kanban graph, and uses revision preconditions plus atomic file replacement. User-entered titles, names, periods, units, and card text are treated as inert data and are never interpreted as model instructions, HTML, shell input, or executable code.

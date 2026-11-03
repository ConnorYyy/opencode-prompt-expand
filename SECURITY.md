# Security

## Reporting

Please report suspected vulnerabilities privately through the repository's GitHub Security Advisory page, or by opening an issue that does not include secrets or prompt contents.

Do not include API keys, provider tokens, full prompts, or personal file contents in an issue.

## Scope

The plugin:

- runs locally in the OpenCode Desktop window and its background server
- sends the draft only to the provider connected in OpenCode
- does not operate a proxy, telemetry endpoint, or credential store
- reads only the project-context whitelist described in `README.md`

The Home/draft fallback uses a DOM adapter because OpenCode does not expose a draft composer API. Treat that path as experimental.

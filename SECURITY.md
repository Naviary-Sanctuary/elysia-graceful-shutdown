# Security Policy

## Supported versions

Security fixes are applied to the latest development line first.

| Version                   | Supported |
| ------------------------- | --------- |
| `0.x`                     | Yes       |
| Earlier pre-release lines | No        |

## Reporting a vulnerability

Please report vulnerabilities through GitHub Security Advisories for this repository or contact the maintainers privately(window95pill@gmail.com). Do not open a public issue for an unpatched security problem.

## Scope notes

Reports are especially helpful when they involve:

- unexpected code execution through provider factories or container hooks;
- token collisions or registry behavior that can resolve the wrong dependency;
- metadata leaks that expose implementation details across package boundaries; or
- denial-of-service style resolution loops that can be triggered by untrusted input.

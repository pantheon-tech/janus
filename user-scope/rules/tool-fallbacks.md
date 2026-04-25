---
description: Tool fallback strategy for file search
---

When using glob/file search tools and they fail on the first attempt, immediately fall back to bash commands like `find`, `ls`, or `fd` instead of retrying glob multiple times.

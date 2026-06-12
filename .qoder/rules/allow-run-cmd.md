---
trigger: always_on
---
# Allow Run Commands Without Confirmation

The AI assistant is allowed to execute the following commands without asking for user confirmation:

- `cd` - Change directory
- `mvn` - Maven build tool commands
- `npm` - Node package manager commands
- `curl` - HTTP request tool

These commands are considered safe for automatic execution in this project context. When any of these commands need to be run, proceed without prompting the user for approval.

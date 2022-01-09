# CLI

Command-line tool for running the development server, deploying projects,
managing secrets, etc.

```
$ npx queue-run help

Usage: index [options] [command]

Options:
  -h, --help                display help for command
  -V, --version             output the version number

Commands:
  build [options] [source]  Build the backend
  dev                       Run the development server
  help [command]            display help for command
```

When you run `npx queue-run` it installs this module locally. This module is larger, since it contains build and deploy code, runtimes, etc.
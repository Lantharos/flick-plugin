# Change Log

All notable changes to the Flick VS Code extension.

## [0.0.1] - 2025-11-09

### Added
- **Syntax Highlighting**: Complete TextMate grammar for Flick language
  - All keywords: `task`, `group`, `blueprint`, `assume`, `maybe`, `otherwise`, `each`, `march`, `select`, `route`, `respond`, etc.
  - String literals with escape sequences (single and double quotes)
  - Number and boolean literals (`yes`, `no`)
  - Comments (`#`)
  - Operators (`:=`, `==`, `!=`, `+`, `-`, `*`, `/`, `=>`, etc.)
  - HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`)
  - Built-in functions and types

- **Language Configuration**:
  - Comment toggling with `#`
  - Auto-closing brackets, parentheses, and quotes
  - Bracket matching and highlighting
  - Smart indentation rules
  - Code folding support

- **Code Snippets**: 20+ snippets for rapid development
  - `task` - Task (function) declaration
  - `free` - Mutable variable declaration
  - `lock` - Immutable variable declaration
  - `assume` - If statement
  - `assumeelse` - If-else statement
  - `each` - For-each loop
  - `march` - Range-based loop
  - `group` - Class declaration
  - `blueprint` - Interface declaration
  - `route` - HTTP route handler
  - `respond` - HTTP response
  - `select` - Select (switch) statement
  - `print` - Print statement
  - `give` - Return statement
  - And more...

- **Commands**:
  - `flick.runFile`: Execute current Flick file (Ctrl+Shift+F / Cmd+Shift+F)
  - `flick.runSelection`: Execute selected Flick code

- **Real-time Diagnostics**:
  - Bracket matching validation
  - Unclosed delimiter detection
  - Real-time syntax error highlighting
  - Configurable via settings

- **Settings**:
  - `flick.interpreterPath`: Custom interpreter path
  - `flick.enableDiagnostics`: Toggle real-time diagnostics (default: true)

- **Examples**: Sample Flick programs
  - hello.fk - Basic syntax demonstration
  - web-server.fk - Web development example
  - classes.fk - Object-oriented programming

- **Documentation**:
  - Comprehensive README with language overview
  - Development guide (DEVELOPMENT.md)
  - Example programs

### Features
- Bundled Flick interpreter for code execution
- Output panel for viewing execution results
- Context menu integration for running files
- Keyboard shortcut support
- File extension support (`.fk`, `.flick`)

### Developer Tools
- TypeScript source code
- Compilation scripts
- VS Code launch configurations
- Extension development workflow

## [Unreleased]

### Planned Features
- Language Server Protocol (LSP) implementation
  - Go to definition
  - Find all references
  - Rename symbol
  - Hover documentation
  - IntelliSense/auto-completion
- Debugger support
- Advanced type checking
- Code formatting
- Refactoring tools
- Symbol outline view
- Breadcrumb navigation

---

Format based on [Keep a Changelog](http://keepachangelog.com/)
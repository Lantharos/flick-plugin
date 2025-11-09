# Flick Language Support for IntelliJ IDEA

Full language support for the Flick programming language in IntelliJ-based IDEs.

## Features

✅ **Syntax Highlighting**
- Keywords (free, lock, group, task, etc.)
- Strings and numbers
- Comments
- Operators and brackets
- Function calls and class names

✅ **Code Completion**
- All Flick keywords
- Built-in functions (print, ask, num, str, JSON.stringify, etc.)
- Plugin declarations (declare web, declare files, etc.)
- Code snippets for common patterns:
  - task blocks
  - group declarations
  - assume/maybe/otherwise conditionals
  - each loops
  - march loops

✅ **Smart Indentation**
- Auto-indent after `=>` arrows
- Proper indentation inside blocks
- Auto-indent for task, group, and control flow blocks

✅ **Code Formatting**
- Automatic code formatting
- Proper spacing and indentation

✅ **Error Detection**
- Unclosed strings
- Invalid variable names
- Syntax errors

✅ **Brace Matching**
- Matching pairs for (), {}, []
- Highlight matching braces

✅ **Commenting**
- Line comments with `#`
- Comment/uncomment with Ctrl+/

## Installation

1. Build the plugin:
   ```bash
   ./gradlew buildPlugin
   ```

2. Install in IntelliJ IDEA:
   - Go to Settings → Plugins
   - Click the gear icon → Install Plugin from Disk
   - Select the built plugin from `build/distributions/`

## Usage

Create a new file with `.fk` extension and start coding in Flick!

## Supported File Extensions

- `.fk` - Flick source files

## Development

To run the plugin in development mode:
```bash
./gradlew runIde
```

## Keywords Supported

- **Variables**: free, lock
- **Control Flow**: assume, maybe, otherwise, each, march, select, when
- **Declarations**: group, task, blueprint, do, declare, use, import
- **Web**: route, respond
- **Literals**: yes, no
- **Types**: num, literal
- **Built-ins**: print, ask, and, give
- **Member Access**: `/` or `.`

## License

ISC


# Flick VS Code Extension Development Guide

## Extension Structure

```
flick/
├── src/                    # TypeScript source files
│   ├── extension.ts       # Main extension activation
│   └── diagnostics.ts     # Syntax checking
├── syntaxes/              # TextMate grammar
│   └── flick.tmLanguage.json
├── snippets/              # Code snippets
│   └── flick.json
├── examples/              # Sample Flick programs
│   ├── hello.fk
│   ├── web-server.fk
│   └── classes.fk
├── temp_interpreter/      # Flick interpreter (bundled)
│   ├── lexer.ts
│   ├── parser.ts
│   ├── interpreter.ts
│   └── ...
├── out/                   # Compiled JavaScript
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── README.md              # Documentation
```

## Building the Extension

### Prerequisites
- Node.js 20+
- npm or yarn
- VS Code 1.105.0+

### Build Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Compile TypeScript:**
   ```bash
   npm run compile
   ```

3. **Watch for changes (development):**
   ```bash
   npm run watch
   ```

## Testing the Extension

### Option 1: Debug Mode (F5)
1. Open the `flick` folder in VS Code
2. Press `F5` to open a new Extension Development Host window
3. In the new window, open a `.fk` file
4. Test syntax highlighting, snippets, and commands

### Option 2: Package and Install
1. Install vsce:
   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:
   ```bash
   vsce package
   ```

3. Install the `.vsix` file:
   - Open VS Code
   - Go to Extensions view
   - Click "..." menu → "Install from VSIX"
   - Select the generated `.vsix` file

## Features Implemented

### ✅ Syntax Highlighting
- All Flick keywords (task, assume, each, march, etc.)
- String literals (single and double quotes)
- Numbers and booleans (yes/no)
- Comments (#)
- Operators (:=, ==, +, -, etc.)
- HTTP methods (GET, POST, PUT, DELETE, PATCH)

### ✅ Language Configuration
- Comment toggling (Ctrl+/)
- Auto-closing brackets, parentheses, quotes
- Bracket matching
- Indentation rules
- Code folding

### ✅ Code Snippets
20+ snippets including:
- `task` - Function declaration
- `free`/`lock` - Variable declarations
- `assume`/`assumeelse` - Conditionals
- `each`/`march` - Loops
- `group`/`blueprint` - Classes and interfaces
- `route`/`respond` - Web development
- And more...

### ✅ Commands
- **Run Flick File** (Ctrl+Shift+F): Execute current file
- **Run Flick Selection**: Execute selected code

### ✅ Diagnostics
- Real-time syntax checking
- Bracket matching validation
- Error highlighting
- Can be toggled via settings

### ✅ Settings
- `flick.interpreterPath`: Custom interpreter path
- `flick.enableDiagnostics`: Toggle diagnostics

## File Structure Details

### package.json
Defines:
- Extension metadata
- Language contribution
- Grammar contribution
- Commands
- Keybindings
- Configuration options
- Activation events

### syntaxes/flick.tmLanguage.json
TextMate grammar defining:
- Token patterns for syntax highlighting
- Keyword recognition
- String, number, boolean patterns
- Comment patterns
- Operator patterns

### language-configuration.json
Language behavior configuration:
- Comment style (#)
- Bracket pairs
- Auto-closing pairs
- Indentation rules
- Folding markers

### src/extension.ts
Main extension entry point:
- Activates on `.fk` files
- Registers commands
- Sets up diagnostics
- Handles file execution

### src/diagnostics.ts
Syntax validation:
- Lexical analysis
- Bracket matching
- Error reporting
- Real-time validation

## Running Flick Code

The extension uses the bundled interpreter to execute Flick code:

1. User presses Ctrl+Shift+F or selects "Run Flick File"
2. Extension saves the file
3. Spawns `tsx` process with interpreter and file path
4. Captures stdout/stderr
5. Displays output in "Flick Output" channel

### Requirements for Execution
- `tsx` must be installed: `npm install -g tsx`
- Interpreter files must be in `temp_interpreter/` folder

## Customization

### Adding Keywords
1. Update `syntaxes/flick.tmLanguage.json`
2. Add to appropriate pattern group
3. Recompile and reload extension

### Adding Snippets
1. Edit `snippets/flick.json`
2. Add new snippet with prefix, body, description
3. Reload extension

### Adding Diagnostics
1. Edit `src/diagnostics.ts`
2. Add validation logic in `updateDiagnostics()`
3. Compile and reload

## Publishing

### Prepare for Publishing
1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Test thoroughly
4. Commit all changes

### Package Extension
```bash
vsce package
```

### Publish to VS Code Marketplace
```bash
vsce publish
```

Note: Requires a publisher account and personal access token.

## Troubleshooting

### Extension doesn't activate
- Check console for errors (Help → Toggle Developer Tools)
- Verify file extension is `.fk` or `.flick`
- Check `activationEvents` in package.json

### Syntax highlighting not working
- Verify `contributes.grammars` in package.json
- Check `scopeName` matches in tmLanguage.json
- Reload window (Ctrl+Shift+P → "Reload Window")

### Commands not appearing
- Check `contributes.commands` in package.json
- Verify command registration in extension.ts
- Check activation events

### Diagnostics not updating
- Check `flick.enableDiagnostics` setting
- Verify language ID is "flick"
- Check console for errors

### Can't run files
- Install tsx: `npm install -g tsx`
- Verify interpreter path in settings
- Check file permissions
- View output in "Flick Output" channel

## Next Steps / Future Enhancements

### Planned Features
- [ ] Language Server Protocol (LSP) implementation
  - Go to definition
  - Find references
  - Rename symbol
  - Hover information
  - Code completion

- [ ] Debugger support
  - Breakpoints
  - Step through code
  - Variable inspection
  - Call stack

- [ ] Advanced diagnostics
  - Type checking
  - Unused variable warnings
  - Import resolution

- [ ] Code formatting
  - Auto-format on save
  - Format selection
  - Format document

- [ ] Refactoring
  - Extract function
  - Extract variable
  - Inline variable

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [TextMate Grammar](https://macromates.com/manual/en/language_grammars)
- [Language Server Protocol](https://microsoft.github.io/language-server-protocol/)
- [VS Code Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## License
MIT

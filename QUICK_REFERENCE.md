# Flick IntelliJ Plugin - Quick Reference

## Keyboard Shortcuts

- **Ctrl+Space** - Code completion
- **Ctrl+/** - Toggle line comment
- **Ctrl+Alt+L** - Reformat code
- **Ctrl+Shift+]** - Jump to matching brace

## Auto-Completion Snippets

Type the following and press Tab/Enter:

### task
```flick
task taskName =>
    
end
```

### group
```flick
group GroupName {
    
}
```

### assume
```flick
assume condition =>
    
end
```

### each
```flick
each item in items =>
    
end
```

### march
```flick
march i from 1 to 10 =>
    
end
```

## Syntax Highlighting Colors

- **Purple/Blue** - Keywords (free, lock, task, etc.)
- **Green** - Strings
- **Blue** - Numbers
- **Gray** - Comments
- **Black** - Identifiers
- **Orange** - Operators

## Auto-Indentation

The plugin automatically indents after:
- `=>` arrow
- Opening braces `{`
- Control flow keywords (assume, each, march, etc.)

Press Enter after any of these to get automatic indentation.

## Error Detection

The plugin will highlight:
- ❌ Unclosed strings
- ❌ Invalid variable names (starting with numbers)
- ⚠️ Syntax errors

## Function Call Highlighting

Function calls are automatically highlighted differently from regular identifiers:
```flick
print "Hello"  # 'print' is highlighted as a function call
free name = "Alice"  # 'name' is a regular identifier
```

## Class Name Highlighting

Capitalized identifiers (like group names) are highlighted as class names:
```flick
group Player {  # 'Player' highlighted as class
    # ...
}
```

## Building the Plugin

```bash
# Build the plugin
./gradlew buildPlugin

# Run in development IDE
./gradlew runIde

# Test the plugin
./gradlew test
```

## Installation

1. Build the plugin: `./gradlew buildPlugin`
2. Find the plugin ZIP in `build/distributions/`
3. In IntelliJ: Settings → Plugins → ⚙️ → Install Plugin from Disk
4. Select the ZIP file
5. Restart IDE

## Troubleshooting

### Plugin not loading
- Check IntelliJ version compatibility (2025.1.4+)
- Rebuild: `./gradlew clean buildPlugin`

### Syntax highlighting not working
- Check file extension is `.fk`
- Try restarting the IDE

### Auto-completion not showing
- Make sure you're in a `.fk` file
- Press Ctrl+Space to trigger manually

## Support

For issues and feature requests, please file an issue in the Flick repository.


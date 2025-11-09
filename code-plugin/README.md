# Flick Language Support for VS Code

Official Visual Studio Code extension for the Flick programming language.

## Features

- **Syntax Highlighting**: Full syntax highlighting for Flick language constructs
- **Code Snippets**: Quick snippets for common Flick patterns (type `task`, `assume`, `each`, etc.)
- **Run Flick Files**: Execute Flick files directly from VS Code
- **Real-time Diagnostics**: Get instant feedback on syntax errors
- **Auto-completion**: Bracket matching and auto-closing pairs

## Language Features

Flick is a modern programming language with:

- **Intuitive Syntax**: Natural language-inspired keywords like `task`, `assume`, `each`, `march`
- **Type Safety**: Optional type annotations with `num` and `literal`
- **Object-Oriented**: Support for `group` (classes) and `blueprint` (interfaces)
- **Web Development**: Built-in web server support with `route` and `respond`
- **Functional Programming**: First-class functions and closures
- **Modern Control Flow**: `assume/maybe/otherwise` (if/elif/else), `each` (for-each), `march` (range loop)

## Syntax Examples

### Variables
```flick
free mutableVar := 42          # Mutable variable
lock constant := "Hello"       # Immutable variable
```

### Functions (Tasks)
```flick
task greet with literal(name) =>
    print "Hello, " and name
end
```

### Control Flow
```flick
assume x > 0 =>
    print "Positive"
maybe x < 0 =>
    print "Negative"
otherwise =>
    print "Zero"
end
```

### Loops
```flick
each item in myList =>
    print item
end

march i from 0 to 10 =>
    print i
end
```

### Web Development
```flick
declare web

route GET "/hello" =>
    respond "Hello, World!"
end
```

### Classes and Interfaces
```flick
group Player {
    free name
    free score := 0
    
    task init with literal(playerName) =>
        name := playerName
    end
}

blueprint Drawable {
    task draw with num(x), num(y)
}
```

## Requirements

- Node.js 20+ (for running the interpreter)
- `tsx` package (for TypeScript execution) - install with: `npm install -g tsx`

## Extension Settings

This extension contributes the following settings:

* `flick.interpreterPath`: Path to custom Flick interpreter executable (leave empty to use bundled interpreter)
* `flick.enableDiagnostics`: Enable/disable real-time syntax checking (default: `true`)

## Keybindings

- `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac): Run current Flick file

## Usage

1. Create a new file with `.fk` or `.flick` extension
2. Write your Flick code with syntax highlighting
3. Use code snippets by typing keywords like `task`, `assume`, `free`, etc.
4. Press `Ctrl+Shift+F` to run the file
5. View output in the "Flick Output" panel

## Example Program

```flick
# Hello World with user input
task main =>
    free name := ask "What's your name? "
    print "Hello, " and name and "!"
    
    march i from 1 to 5 =>
        print "Count: " and i
    end
end

main
```

## File Extensions

- `.fk` - Primary Flick source files
- `.flick` - Alternative Flick source files

## Snippets

Type these prefixes and press Tab to insert code snippets:

- `task` - Task declaration
- `free` - Mutable variable
- `lock` - Immutable variable
- `assume` - If statement
- `assumeelse` - If-else statement
- `each` - For-each loop
- `march` - Range loop
- `group` - Class declaration
- `blueprint` - Interface declaration
- `route` - Route handler
- `print` - Print statement
- And more!

## Release Notes

### 0.0.1

Initial release:
- Full syntax highlighting for all Flick keywords and constructs
- 20+ code snippets for rapid development
- File execution support with output panel
- Real-time syntax error detection
- Auto-closing pairs and bracket matching
- Comment support (#)

## Known Issues

- Advanced language server features (go to definition, find references) coming in future releases
- Debugger support planned for future versions

## Contributing

Contributions are welcome! This extension is part of the Flick language project.

## License

MIT

---

**Enjoy coding with Flick!** 🚀

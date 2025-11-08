package com.lantharos.flick

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.psi.PsiElement

// Built-in functions that should be highlighted
val BUILTIN_FUNCTIONS: Set<String> = setOf(
    "print", "ask", "num", "str", "read", "write", "exists",
    "sleep", "now", "random", "randint", "shuffle", "choice"
)

// Plugin-specific keywords and functions
val WEB_PLUGIN_KEYWORDS: Set<String> = setOf("route", "respond", "GET", "POST", "PUT", "DELETE", "PATCH")
val WEB_ROUTE_ONLY_KEYWORDS: Set<String> = setOf("query", "body", "headers") // Only usable inside route blocks
val FILE_PLUGIN_KEYWORDS: Set<String> = setOf("read", "write", "exists", "listdir")

// Map plugins to their keywords
val PLUGIN_KEYWORDS: Map<String, Set<String>> = mapOf(
    "web" to WEB_PLUGIN_KEYWORDS,
    "file" to FILE_PLUGIN_KEYWORDS
)

class FlickAnnotator : Annotator {

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (element.containingFile.fileType != FlickFileType) return

        val text = element.text.trim()

        // Skip if empty or whitespace
        if (text.isEmpty()) return

        val file = element.containingFile
        val fileText = file.text
        val offset = element.textRange.startOffset

        // Get declared plugins from the file
        val declaredPlugins = getDeclaredPlugins(fileText)

        // Check for plugin-specific keywords BEFORE skipping keywords
        checkPluginSpecificKeyword(text, declaredPlugins, element, holder)
        checkRouteOnlyKeywords(text, element, holder)

        // Skip all keywords immediately - they're already highlighted by the lexer
        val allKeywords = setOf(
            "free", "lock", "task", "route", "assume", "maybe", "otherwise", "each", "march",
            "group", "blueprint", "do", "end", "select", "suppose", "when", "and", "or", "not",
            "yes", "no", "declare", "import", "from", "with", "in", "to", "for", "while", "use",
            "give", "respond", "num", "literal", "print", "ask"
        )
        if (text in allKeywords) {
            // For specific keywords, do additional validation
            when (text) {
                "end" -> checkEndStatement(element, holder)
                "task", "route", "assume", "maybe", "otherwise", "each", "march", "group",
                "select", "suppose", "do", "when" -> checkBlockStart(element, holder)
            }
            return
        }


        // Check for element-specific issues
        when {
            // Unclosed strings
            element.text.startsWith("\"") && !element.text.endsWith("\"") && element.text.length > 1 -> {
                holder.newAnnotation(HighlightSeverity.ERROR, "Unclosed string")
                    .range(element)
                    .create()
            }

            // Invalid variable names
            text.matches(Regex("\\d+[a-zA-Z_].*")) -> {
                holder.newAnnotation(HighlightSeverity.ERROR, "Variable names cannot start with a number")
                    .range(element)
                    .create()
            }


            // Highlight built-in functions (like ask, print, etc.)
            text in BUILTIN_FUNCTIONS -> {
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.PREDEFINED_SYMBOL)
                    .create()
            }

            // Highlight class/group names (capitalized identifiers)
            text.matches(Regex("[A-Z][a-zA-Z0-9_]*")) -> {
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.CLASS_NAME)
                    .create()
            }

            // Check for everything else including function calls
            else -> {
                checkVariableIssues(element, text, fileText, holder)
                checkUndefinedReferences(element, text, fileText, holder)
            }
        }
    }

    private fun checkEndStatement(element: PsiElement, holder: AnnotationHolder) {
        val fileText = element.containingFile.text
        val offset = element.textRange.startOffset

        // Get text before this end statement
        val textBefore = fileText.substring(0, offset)

        // Remove comments to avoid counting keywords in comments
        val textWithoutComments = textBefore.lines().joinToString("\n") { line ->
            val commentIndex = line.indexOf('#')
            if (commentIndex >= 0) line.substring(0, commentIndex) else line
        }

        // Track block depth
        var blockDepth = 0
        // Block starters: task, route, each, march, group, assume, select, suppose, do
        // Continuations: maybe, otherwise, when (don't start new blocks)
        val blockPattern = Regex("""(task|route|assume|each|march|group|select|suppose|do)\b.*=>|(maybe|otherwise|when)\b.*=>|\bend\b""")

        blockPattern.findAll(textWithoutComments).forEach { match ->
            val matchText = match.value.trim()
            when {
                matchText == "end" -> blockDepth--
                matchText.startsWith("maybe") || matchText.startsWith("otherwise") || matchText.startsWith("when") -> {
                    // These don't increase depth, they're continuations
                }
                else -> blockDepth++ // task, route, assume, each, march, group, select, suppose, do
            }
        }

        // If blockDepth is negative, this end has no matching block
        if (blockDepth < 0) {
            holder.newAnnotation(HighlightSeverity.ERROR, "Unexpected 'end' statement without matching block")
                .range(element)
                .create()
        }
    }

    private fun checkBlockStart(element: PsiElement, holder: AnnotationHolder) {
        val fileText = element.containingFile.text
        val offset = element.textRange.startOffset

        // Look for => after this keyword on the same or next line
        val textAfter = fileText.substring(offset)
        val nextLines = textAfter.split("\n").take(2).joinToString("\n")

        if (!nextLines.contains("=>")) {
            return // Not a block start, just the keyword
        }

        // maybe, otherwise, and when are continuations, not new blocks
        if (element.text.trim() in listOf("maybe", "otherwise", "when")) {
            return
        }

        // Check if this is an inline assume (single-line ternary expression)
        if (element.text.trim() == "assume") {
            val lineAfterArrow = textAfter.substringAfter("=>").substringBefore("\n").trim()

            // If the entire assume expression is on one line and has content after =>, it's inline
            if (lineAfterArrow.isNotEmpty() && !lineAfterArrow.endsWith("=>")) {
                return // This is inline assume, no end needed
            }

            // If there's a comma with otherwise, it's an inline ternary
            if (textAfter.contains(Regex("""=>\s*[^,\n]+,\s*otherwise\s*=>"""))) {
                return // Inline ternary, no end needed
            }
        }

        // Find the matching end for this block
        val textAfterArrow = textAfter.substringAfter("=>")
        var blockDepth = 1
        var foundEnd = false

        // Block starters: task, route, each, march, group, assume, select, suppose, do
        // Continuations: maybe, otherwise, when (don't increase depth)
        val blockPattern = Regex("""(task|route|assume|each|march|group|select|suppose|do)\b.*=>|(maybe|otherwise|when)\b.*=>|\bend\b""")
        blockPattern.findAll(textAfterArrow).forEach { match ->
            val matchText = match.value.trim()
            val fullMatch = match.value

            when {
                matchText == "end" -> {
                    blockDepth--
                    if (blockDepth == 0) {
                        foundEnd = true
                        return@forEach
                    }
                }
                matchText.startsWith("maybe") || matchText.startsWith("otherwise") || matchText.startsWith("when") -> {
                    // These don't increase depth
                }
                matchText.startsWith("assume") -> {
                    // Check if this is an inline assume
                    val afterMatch = textAfterArrow.substring(match.range.first)
                    val restOfLine = afterMatch.substringBefore('\n')

                    // If content after => on same line and not just another =>, it's inline
                    if (restOfLine.contains("=>") && !restOfLine.trim().endsWith("=>")) {
                        // Inline assume, don't count it
                    } else {
                        blockDepth++ // Block assume
                    }
                }
                else -> blockDepth++ // task, route, each, march, group, select, suppose, do
            }
        }

        if (!foundEnd) {
            holder.newAnnotation(
                HighlightSeverity.ERROR,
                "Missing 'end' statement for '${element.text}' block"
            )
                .range(element)
                .create()
        }
    }

    private fun checkVariableIssues(element: PsiElement, text: String, fileText: String, holder: AnnotationHolder) {
        // Check for duplicate variable declarations
        if (text.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]*"))) {
            val varPattern = Regex("""(?:free|lock)\s+(?:num\s+|literal\s+)?${Regex.escape(text)}\s*=""")
            val matches = varPattern.findAll(fileText).toList()

            if (matches.size > 1) {
                // Check if this element is part of a declaration (not the first one)
                val offset = element.textRange.startOffset
                val firstMatch = matches.first()
                if (offset > firstMatch.range.first) {
                    holder.newAnnotation(
                        HighlightSeverity.ERROR,
                        "Variable '$text' is already declared"
                    )
                        .range(element)
                        .create()
                }
            }

            // Check for assignment to locked variables
            val lockPattern = Regex("""lock\s+(?:num\s+|literal\s+)?${Regex.escape(text)}\s*=""")
            if (lockPattern.containsMatchIn(fileText)) {
                // Check if this is an assignment
                val offset = element.textRange.startOffset
                if (offset > 0 && fileText.getOrNull(offset - 1) == ':' ||
                    (offset > 1 && fileText.substring(maxOf(0, offset - 3), offset).trim() == ":=")) {
                    holder.newAnnotation(
                        HighlightSeverity.ERROR,
                        "Cannot reassign locked variable '$text'"
                    )
                        .range(element)
                        .create()
                }
            }
        }
    }


    private fun getDeclaredPlugins(fileText: String): Set<String> {
        val plugins = mutableSetOf<String>()
        val declarePattern = Regex("""declare\s+(\w+)(?:@\d+)?""")

        declarePattern.findAll(fileText).forEach { match ->
            plugins.add(match.groupValues[1])
        }

        return plugins
    }

    private fun checkPluginSpecificKeyword(
        text: String,
        declaredPlugins: Set<String>,
        element: PsiElement,
        holder: AnnotationHolder
    ) {
        for ((pluginName, keywords) in PLUGIN_KEYWORDS) {
            if (text in keywords && pluginName !in declaredPlugins) {
                holder.newAnnotation(
                    HighlightSeverity.ERROR,
                    "Keyword '$text' requires 'declare $pluginName' at the top of the file"
                )
                    .range(element)
                    .create()
                return
            }
        }
    }

    private fun checkRouteOnlyKeywords(text: String, element: PsiElement, holder: AnnotationHolder) {
        if (text !in WEB_ROUTE_ONLY_KEYWORDS) return

        // Check if we're inside a route block
        val fileText = element.containingFile.text
        val offset = element.textRange.startOffset
        val textBefore = fileText.substring(0, offset)

        // Check if there's a route block enclosing this element
        val isInsideRoute = isInsideRouteBlock(textBefore)

        if (!isInsideRoute) {
            holder.newAnnotation(
                HighlightSeverity.ERROR,
                "Keyword '$text' can only be used inside a 'route' block"
            )
                .range(element)
                .create()
        }
    }

    private fun isInsideRouteBlock(textBefore: String): Boolean {
        // Remove comments
        val cleanTextBefore = textBefore.lines().joinToString("\n") { line ->
            val commentIndex = line.indexOf('#')
            if (commentIndex >= 0) line.substring(0, commentIndex) else line
        }

        // Track route block depth
        var routeDepth = 0
        val blockPattern = Regex("""(route)\b.*=>|(task|assume|each|march|group|select|suppose|do)\b.*=>|\bend\b""")

        blockPattern.findAll(cleanTextBefore).forEach { match ->
            val matchText = match.value.trim()
            when {
                matchText == "end" -> routeDepth--
                matchText.startsWith("route") -> routeDepth++
                else -> {} // Other blocks don't affect route depth
            }
        }

        return routeDepth > 0
    }

    private fun checkUndefinedReferences(element: PsiElement, text: String, fileText: String, holder: AnnotationHolder) {
        // Skip if not an identifier
        if (!text.matches(Regex("[a-zA-Z_][a-zA-Z0-9_]*"))) return

        // Skip keywords
        val allKeywords = setOf(
            "free", "lock", "task", "route", "assume", "maybe", "otherwise", "each", "march",
            "group", "blueprint", "do", "end", "select", "suppose", "when", "and", "or", "not",
            "yes", "no", "declare", "import", "from", "with", "in", "to", "for", "while", "use",
            "give", "respond", "GET", "POST", "PUT", "DELETE", "PATCH", "num", "literal"
        )
        if (text in allKeywords || text in BUILTIN_FUNCTIONS || text in WEB_PLUGIN_KEYWORDS ||
            text in WEB_ROUTE_ONLY_KEYWORDS || text in FILE_PLUGIN_KEYWORDS) {
            return
        }

        val offset = element.textRange.startOffset
        val textBefore = fileText.substring(maxOf(0, offset - 150), offset)
        val textAfter = fileText.substring(offset, minOf(fileText.length, offset + text.length + 50))

        // Get current line
        val lineStart = fileText.lastIndexOf('\n', maxOf(0, offset - 1)) + 1
        val lineEnd = fileText.indexOf('\n', offset).let { if (it == -1) fileText.length else it }
        val currentLine = fileText.substring(lineStart, lineEnd).trim()

        // Skip if THIS SPECIFIC identifier is being declared
        // Check various declaration contexts

        // Variable declaration: free/lock [type] IDENTIFIER =
        val varDeclPattern = Regex("""(?:free|lock)\s+(?:num\s+|literal\s+|[A-Z][a-zA-Z0-9_]*\s+)?${Regex.escape(text)}\s*=""")
        if (varDeclPattern.containsMatchIn(currentLine)) {
            val match = varDeclPattern.find(currentLine)
            if (match != null) {
                // Make sure this identifier is at the declaration position, not after the =
                val matchEnd = lineStart + match.range.last
                if (offset < matchEnd) {
                    return
                }
            }
        }

        // Task declaration: task IDENTIFIER with/=>
        val taskDeclPattern = Regex("""task\s+${Regex.escape(text)}\s*(?:with|=>)""")
        if (taskDeclPattern.containsMatchIn(currentLine)) {
            val match = taskDeclPattern.find(currentLine)
            if (match != null) {
                val matchEnd = lineStart + match.range.last
                if (offset < matchEnd) {
                    return
                }
            }
        }

        // Skip if inside num(...) or literal(...) - parameter declarations
        val lastOpenParen = textBefore.lastIndexOf('(')
        val lastCloseParen = textBefore.lastIndexOf(')')
        if (lastOpenParen > lastCloseParen) {
            val beforeParen = textBefore.substring(0, lastOpenParen).trim()
            if (beforeParen.endsWith("num") || beforeParen.endsWith("literal")) {
                return
            }
        }

        // Skip if in loop variable: each varname in ... or march varname from ...
        if (currentLine.matches(Regex("""(?:each|march)\s+${Regex.escape(text)}\s+(?:in|from).*"""))) {
            return
        }

        // Skip if in group/blueprint declaration
        if (currentLine.matches(Regex("""(?:group|blueprint)\s+${Regex.escape(text)}\s*\{.*"""))) {
            return
        }

        // Check if this identifier comes after / or . (method call like obj/method or obj.method)
        if (textBefore.trimEnd().endsWith("/") || textBefore.trimEnd().endsWith(".")) {
            // Validate the method exists on the object
            val beforeSlash = textBefore.trimEnd().dropLast(1).trim()
            val objectNameMatch = Regex("""([a-zA-Z_][a-zA-Z0-9_]*)\s*$""").find(beforeSlash)

            if (objectNameMatch != null) {
                val objectName = objectNameMatch.groupValues[1]

                // Find the class/group of this object
                val classPattern = Regex("""(?:free|lock)\s+([A-Z][a-zA-Z0-9_]*)\s+${Regex.escape(objectName)}\s*=""")
                val classMatch = classPattern.find(fileText.take(offset))

                if (classMatch != null) {
                    val className = classMatch.groupValues[1]

                    // Find the group definition - need to match braces properly
                    val groupStartPattern = Regex("""group\s+${Regex.escape(className)}\s*\{""")
                    val groupStartMatch = groupStartPattern.find(fileText)

                    if (groupStartMatch != null) {
                        val groupStart = groupStartMatch.range.last + 1

                        // Find matching closing brace
                        var braceCount = 1
                        var groupEnd = groupStart
                        while (groupEnd < fileText.length && braceCount > 0) {
                            when (fileText[groupEnd]) {
                                '{' -> braceCount++
                                '}' -> braceCount--
                            }
                            if (braceCount > 0) groupEnd++
                        }

                        val groupBody = fileText.substring(groupStart, groupEnd)
                        val methodPattern = Regex("""task\s+${Regex.escape(text)}\b""")

                        if (!methodPattern.containsMatchIn(groupBody)) {
                            // Method doesn't exist - always error
                            holder.newAnnotation(
                                HighlightSeverity.ERROR,
                                "Method '$text' is not defined in class '$className'"
                            )
                                .range(element)
                                .create()
                        }
                    } else {
                        // Group not found - error
                        holder.newAnnotation(
                            HighlightSeverity.ERROR,
                            "Class '$className' is not defined"
                        )
                            .range(element)
                            .create()
                    }
                } else {
                    // Object not found or not typed - can't validate method
                    // Skip validation in this case
                }
            }
            return
        }

        // Skip if this is a named parameter (like json=, status=)
        if (textAfter.startsWith("=") && !textAfter.startsWith("==") && !textAfter.startsWith("=>")) {
            return
        }

        // Skip if in declare statement
        if (currentLine.startsWith("declare")) {
            return
        }

        // Skip if after "use" keyword
        if (textBefore.matches(Regex(""".*\buse\s+$"""))) {
            return
        }

        // Check if this is a function call
        val isFunctionCall = isFollowedByArguments(element, fileText, offset) ||
            (element.nextSibling?.text?.trim()?.startsWith("with") == true)

        // Check if function exists
        val taskPattern = Regex("""task\s+${Regex.escape(text)}\b""")
        val functionExists = taskPattern.containsMatchIn(fileText)

        // Check if variable exists in scope
        val variableExists = isVariableInScope(text, offset, fileText)

        // Check if it's a class/group
        val groupPattern = Regex("""group\s+${Regex.escape(text)}\b""")
        val blueprintPattern = Regex("""blueprint\s+${Regex.escape(text)}\b""")
        val isClass = text.matches(Regex("[A-Z][a-zA-Z0-9_]*")) &&
                     (groupPattern.containsMatchIn(fileText.take(offset)) ||
                      blueprintPattern.containsMatchIn(fileText.take(offset)))

        if (isFunctionCall) {
            // Looks like a function call - must be a defined function (not just a variable)
            if (!functionExists) {
                // Definitely error - this looks like a function call but the function doesn't exist
                holder.newAnnotation(
                    HighlightSeverity.ERROR,
                    "Function '$text' is not defined"
                )
                    .range(element)
                    .create()
                return // Don't check as variable
            } else {
                // Function exists - highlight it as a function call
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.FUNCTION_CALL)
                    .create()
                return
            }
        } else {
            // Not a function call - must be a variable or class
            if (!variableExists && !isClass && !functionExists) {
                holder.newAnnotation(
                    HighlightSeverity.ERROR,
                    "Variable '$text' is not defined"
                )
                    .range(element)
                    .create()
            }
        }
    }

    private fun isVariableInScope(varName: String, offset: Int, fileText: String): Boolean {
        val textBefore = fileText.substring(0, offset)

        // Remove comments
        val cleanText = textBefore.lines().joinToString("\n") { line ->
            val commentIndex = line.indexOf('#')
            if (commentIndex >= 0) line.substring(0, commentIndex) else line
        }

        // Check for free/lock variable declarations BEFORE this offset
        val varPattern = Regex("""(?:free|lock)\s+(?:num\s+|literal\s+|[A-Z][a-zA-Z0-9_]*\s+)?${Regex.escape(varName)}\s*=""")
        if (varPattern.containsMatchIn(cleanText)) {
            // Make sure it's not inside a function that has ended
            return true
        }

        // Check for function parameters - only accessible within the function
        val paramPattern = Regex("""\bwith\s+[^=]*\b(?:num|literal|[A-Z][a-zA-Z0-9_]*)\s*\(\s*${Regex.escape(varName)}\s*\)""")
        if (paramPattern.containsMatchIn(cleanText)) {
            // Check if we're still inside that function
            return isInsideFunction(varName, offset, fileText)
        }

        // Check for loop variables - only accessible within the loop
        val loopPattern = Regex("""\b(?:each|march)\s+${Regex.escape(varName)}\s+(?:in|from)\b""")
        if (loopPattern.containsMatchIn(cleanText)) {
            // Check if we're still inside that loop
            return isInsideLoop(varName, offset, fileText)
        }

        // Check for group field declarations (inside {...})
        val groupFieldPattern = Regex("""free\s+(?:num\s+|literal\s+)?${Regex.escape(varName)}\b""")
        if (groupFieldPattern.containsMatchIn(cleanText)) return true

        return false
    }

    private fun isInsideFunction(paramName: String, offset: Int, fileText: String): Boolean {
        val textBefore = fileText.substring(0, offset)

        // Find ALL task declarations that contain this parameter
        val taskPattern = Regex("""task\s+[a-zA-Z_][a-zA-Z0-9_]*\s+with[^=]*\b(?:num|literal|[A-Z][a-zA-Z0-9_]*)\s*\(\s*${Regex.escape(paramName)}\s*\)[^=]*=>""")
        val matches = taskPattern.findAll(textBefore).toList()

        if (matches.isEmpty()) return false

        // Check each matching function to see if we're still inside it
        for (match in matches.reversed()) {
            val functionStart = match.range.first

            // Find the matching 'end' for this function
            val afterFunction = fileText.substring(functionStart)
            var depth = 0
            val blockPattern = Regex("""(task|route|assume|each|march|group|select|suppose|do)\b[^=]*=>|\bend\b""")

            var functionEnd = fileText.length
            blockPattern.findAll(afterFunction).forEach { blockMatch ->
                val blockText = blockMatch.value.trim()
                when {
                    blockText == "end" -> {
                        depth--
                        if (depth == 0) {
                            functionEnd = functionStart + blockMatch.range.first
                            return@forEach
                        }
                    }
                    else -> {
                        depth++
                    }
                }
            }

            // Check if offset is between function start and end
            if (offset > functionStart && offset < functionEnd) {
                return true
            }
        }

        return false
    }

    private fun isInsideLoop(loopVar: String, offset: Int, fileText: String): Boolean {
        val textBefore = fileText.substring(0, offset)

        // Find ALL loops that define this variable
        val loopPattern = Regex("""\b(?:each|march)\s+${Regex.escape(loopVar)}\s+(?:in|from)[^=]*=>""")
        val matches = loopPattern.findAll(textBefore).toList()

        if (matches.isEmpty()) return false

        // Check each matching loop to see if we're still inside it
        for (match in matches.reversed()) {
            val loopStart = match.range.first

            // Find the matching 'end' for this loop
            val afterLoop = fileText.substring(loopStart)
            var depth = 0
            val blockPattern = Regex("""(task|route|assume|each|march|group|select|suppose|do)\b[^=]*=>|\bend\b""")

            var loopEnd = fileText.length
            blockPattern.findAll(afterLoop).forEach { blockMatch ->
                val blockText = blockMatch.value.trim()
                when {
                    blockText == "end" -> {
                        depth--
                        if (depth == 0) {
                            loopEnd = loopStart + blockMatch.range.first
                            return@forEach
                        }
                    }
                    else -> {
                        depth++
                    }
                }
            }

            // Check if offset is between loop start and end
            if (offset > loopStart && offset < loopEnd) {
                return true
            }
        }

        return false
    }

    private fun isFollowedByArguments(element: PsiElement, fileText: String, offset: Int): Boolean {
        // Get the rest of the line after this identifier
        val afterIdentifier = fileText.substring(offset + element.text.length)
        val restOfLine = afterIdentifier.substringBefore('\n').trim()

        if (restOfLine.isEmpty()) return false

        // Skip operators and keywords that are NOT function arguments
        val nonArgumentStarters = setOf(
            "and", "or", "not", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/",
            ":=", "=", "=>", ",", ")", "]", "}", "then", "end"
        )

        // Check if it starts with any non-argument starter
        for (starter in nonArgumentStarters) {
            if (restOfLine.startsWith(starter)) {
                return false
            }
        }

        // Check if the rest of the line starts with something that could be an argument
        // Arguments can be: numbers, strings, identifiers (but not keywords), true/false, opening brackets/parens
        val firstChar = restOfLine[0]
        return firstChar.isLetterOrDigit() || firstChar in "\"'{[(" || restOfLine.startsWith("yes") || restOfLine.startsWith("no")
    }

    private fun isFunctionName(text: String): Boolean {
        return text.matches(Regex("[a-z_][a-zA-Z0-9_]*"))
    }
}


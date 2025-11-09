package com.lantharos.flick.editor

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext
import com.lantharos.flick.core.NpmPackageService

class FlickCompletionContributor : CompletionContributor() {
    init {
        this.extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    result: CompletionResultSet
                ) {
                    val position = parameters.position
                    val file = position.containingFile
                    val fileText = file.text
                    val offset = parameters.offset

                    // Keywords
                    val keywords = listOf(
                        "free", "lock", "group", "task", "blueprint", "do", "for",
                        "assume", "maybe", "otherwise", "each", "in", "march", "from", "to",
                        "select", "when", "suppose", "print", "declare", "use", "import",
                        "route", "respond", "with", "end", "yes", "no", "num", "literal",
                        "ask", "and", "give", "as"
                    )

                    keywords.forEach { keyword ->
                        result.addElement(
                            LookupElementBuilder.create(keyword)
                                .bold()
                                .withTypeText("keyword")
                        )
                    }

                    // Find all defined functions in the file
                    val functionPattern = Regex("""task\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:with|=>)""")
                    functionPattern.findAll(fileText).forEach { match ->
                        val funcName = match.groupValues[1]
                        result.addElement(
                            LookupElementBuilder.create(funcName)
                                .withTypeText("function")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.Function)
                        )
                    }

                    // Find all variables in scope
                    val textBefore = fileText.substring(0, offset)
                    val varPattern = Regex("""(?:free|lock)\s+(?:num\s+|literal\s+|[A-Z][a-zA-Z0-9_]*\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=""")
                    varPattern.findAll(textBefore).forEach { match ->
                        val varName = match.groupValues[1]
                        result.addElement(
                            LookupElementBuilder.create(varName)
                                .withTypeText("variable")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.Variable)
                        )
                    }

                    // Find multi-variable declarations (free data, error = ... or with 'as')
                    val multiVarPattern = Regex("""(?:free|lock)\s+([^=]+)=""")
                    multiVarPattern.findAll(textBefore).forEach { match ->
                        val varsText = match.groupValues[1]
                        varsText.split(",").forEach { varDecl ->
                            val trimmed = varDecl.trim()
                            if (trimmed.contains(" as ")) {
                                val parts = trimmed.split(Regex("\\s+as\\s+"))
                                if (parts.size == 2) {
                                    // Add both original and alias
                                    result.addElement(
                                        LookupElementBuilder.create(parts[0].trim())
                                            .withTypeText("variable")
                                            .withIcon(com.intellij.icons.AllIcons.Nodes.Variable)
                                    )
                                    result.addElement(
                                        LookupElementBuilder.create(parts[1].trim())
                                            .withTypeText("variable (alias)")
                                            .withIcon(com.intellij.icons.AllIcons.Nodes.Variable)
                                    )
                                }
                            } else if (trimmed.isNotEmpty()) {
                                result.addElement(
                                    LookupElementBuilder.create(trimmed)
                                        .withTypeText("variable")
                                        .withIcon(com.intellij.icons.AllIcons.Nodes.Variable)
                                )
                            }
                        }
                    }

                    // Find imported symbols from npm packages
                    val imports = NpmPackageService.getImportsFromFile(fileText)
                    imports.forEach { (symbol, packageName) ->
                        result.addElement(
                            LookupElementBuilder.create(symbol)
                                .withTypeText("imported from $packageName")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.ModuleGroup)
                        )
                    }

                    // Find parameters in current function scope
                    val paramPattern = Regex("""\bwith\s+[^=]*\b(?:num|literal|[A-Z][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)""")
                    paramPattern.findAll(textBefore).forEach { match ->
                        val paramName = match.groupValues[1]
                        result.addElement(
                            LookupElementBuilder.create(paramName)
                                .withTypeText("parameter")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.Parameter)
                        )
                    }

                    // Find loop variables in scope
                    val loopPattern = Regex("""\b(?:each|march)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:in|from)\b""")
                    loopPattern.findAll(textBefore).forEach { match ->
                        val loopVar = match.groupValues[1]
                        result.addElement(
                            LookupElementBuilder.create(loopVar)
                                .withTypeText("loop variable")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.Variable)
                        )
                    }

                    // Find all groups/classes
                    val groupPattern = Regex("""(?:group|blueprint)\s+([A-Z][a-zA-Z0-9_]*)""")
                    groupPattern.findAll(textBefore).forEach { match ->
                        val className = match.groupValues[1]
                        result.addElement(
                            LookupElementBuilder.create(className)
                                .withTypeText("class")
                                .withIcon(com.intellij.icons.AllIcons.Nodes.Class)
                        )
                    }

                    // Built-in plugins
                    val plugins = listOf("web", "files", "time", "random")
                    plugins.forEach { plugin ->
                        result.addElement(
                            LookupElementBuilder.create("declare $plugin")
                                .withPresentableText("declare $plugin")
                                .withTypeText("plugin")
                        )
                    }

                    // Built-in functions
                    val builtins = listOf(
                        "print", "ask", "num", "str", "JSON.stringify", "JSON.parse"
                    )
                    builtins.forEach { builtin ->
                        result.addElement(
                            LookupElementBuilder.create(builtin)
                                .withTypeText("built-in")
                        )
                    }

                    // Common snippets
                    result.addElement(
                        LookupElementBuilder.create("task")
                            .withInsertHandler { ctx, _ ->
                                val doc = ctx.document
                                val offs = ctx.tailOffset
                                doc.insertString(offs, " taskName =>\n    \nend")
                                ctx.editor.caretModel.moveToOffset(offs + 6)
                            }
                            .withPresentableText("task (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("group")
                            .withInsertHandler { ctx, _ ->
                                val doc = ctx.document
                                val offs = ctx.tailOffset
                                doc.insertString(offs, " GroupName {\n    \n}")
                                ctx.editor.caretModel.moveToOffset(offs + 7)
                            }
                            .withPresentableText("group (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("assume")
                            .withInsertHandler { ctx, _ ->
                                val doc = ctx.document
                                val offs = ctx.tailOffset
                                doc.insertString(offs, " condition =>\n    \nend")
                                ctx.editor.caretModel.moveToOffset(offs + 1)
                            }
                            .withPresentableText("assume (snippet)")
                            .withTypeText("snippet")
                    )
                }
            }
        )
    }
}


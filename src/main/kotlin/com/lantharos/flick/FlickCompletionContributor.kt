package com.lantharos.flick

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext

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
                    // Keywords
                    val keywords = listOf(
                        "free", "lock", "group", "task", "blueprint", "do", "for",
                        "assume", "maybe", "otherwise", "each", "in", "march", "from", "to",
                        "select", "when", "suppose", "print", "declare", "use", "import",
                        "route", "respond", "with", "end", "yes", "no", "num", "literal",
                        "ask", "and", "give"
                    )

                    keywords.forEach { keyword ->
                        result.addElement(
                            LookupElementBuilder.create(keyword)
                                .bold()
                                .withTypeText("keyword")
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

                    // Common snippets
                    result.addElement(
                        LookupElementBuilder.create("task")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " taskName =>\n    \nend")
                                context.editor.caretModel.moveToOffset(offset + 6)
                            }
                            .withPresentableText("task (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("group")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " GroupName {\n    \n}")
                                context.editor.caretModel.moveToOffset(offset + 7)
                            }
                            .withPresentableText("group (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("assume")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " condition =>\n    \nend")
                                context.editor.caretModel.moveToOffset(offset + 1)
                            }
                            .withPresentableText("assume (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("each")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " item in items =>\n    \nend")
                                context.editor.caretModel.moveToOffset(offset + 1)
                            }
                            .withPresentableText("each (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("march")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " i from 1 to 10 =>\n    \nend")
                                context.editor.caretModel.moveToOffset(offset + 1)
                            }
                            .withPresentableText("march (snippet)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("give")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " ")
                                context.editor.caretModel.moveToOffset(offset + 1)
                            }
                            .withPresentableText("give (return)")
                            .withTypeText("snippet")
                    )

                    result.addElement(
                        LookupElementBuilder.create("assume")
                            .withInsertHandler { context, _ ->
                                val doc = context.document
                                val offset = context.tailOffset
                                doc.insertString(offset, " condition => value, otherwise => alternate")
                                context.editor.caretModel.moveToOffset(offset + 1)
                            }
                            .withPresentableText("assume (ternary)")
                            .withTypeText("snippet")
                    )

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
                }
            }
        )
    }
}


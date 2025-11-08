package com.lantharos.flick

import com.intellij.codeInsight.editorActions.TypedHandlerDelegate
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile

class FlickTypedHandler : TypedHandlerDelegate() {
    override fun charTyped(c: Char, project: Project, editor: Editor, file: PsiFile): Result {
        if (file.fileType != FlickFileType) {
            return Result.CONTINUE
        }

        // Only handle specific cases, let IntelliJ's formatter handle general indentation
        when (c) {
            '\n' -> {
                val document = editor.document
                val offset = editor.caretModel.offset
                val lineNumber = document.getLineNumber(offset)

                if (lineNumber > 0) {
                    val prevLineStart = document.getLineStartOffset(lineNumber - 1)
                    val prevLineEnd = document.getLineEndOffset(lineNumber - 1)
                    val prevLineText = document.getText(com.intellij.openapi.util.TextRange(prevLineStart, prevLineEnd))

                    // Only indent if previous line ends with => (block start)
                    val trimmedPrevLine = prevLineText.trimEnd()
                    if (trimmedPrevLine.endsWith("=>")) {
                        val currentLineStart = document.getLineStartOffset(lineNumber)
                        val currentLineEnd = document.getLineEndOffset(lineNumber)
                        val currentLineText = document.getText(com.intellij.openapi.util.TextRange(currentLineStart, currentLineEnd))

                        // Only add indent if current line is not already indented
                        if (currentLineText.trim().isEmpty()) {
                            val indent = prevLineText.takeWhile { it.isWhitespace() }
                            val newIndent = indent + "    " // 4 spaces

                            document.insertString(currentLineStart, newIndent)
                            editor.caretModel.moveToOffset(currentLineStart + newIndent.length)
                        }
                    }
                }
            }
        }

        return Result.CONTINUE
    }
}


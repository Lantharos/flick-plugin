package com.lantharos.flick.editor

import com.intellij.lang.Language
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.codeStyle.lineIndent.LineIndentProvider
import com.lantharos.flick.core.FlickLanguage

class FlickLineIndentProvider : LineIndentProvider {
    override fun getLineIndent(project: Project, editor: Editor, language: Language?, offset: Int): String? {
        if (language != FlickLanguage) return null

        val document = editor.document
        val lineNumber = document.getLineNumber(offset)

        // First line has no indent
        if (lineNumber == 0) return ""

        // Get current line to check if we're typing a closing keyword
        val currentLineStart = document.getLineStartOffset(lineNumber)
        val currentLineEnd = document.getLineEndOffset(lineNumber)
        val currentLineText = document.getText(com.intellij.openapi.util.TextRange(currentLineStart, currentLineEnd))
        val trimmedCurrentLine = currentLineText.trim()

        // Get previous line
        val prevLineNumber = lineNumber - 1
        val prevLineStart = document.getLineStartOffset(prevLineNumber)
        val prevLineEnd = document.getLineEndOffset(prevLineNumber)
        val prevLineText = document.getText(com.intellij.openapi.util.TextRange(prevLineStart, prevLineEnd))

        // Get the indent of the previous line
        val prevIndent = getPrevLineIndent(prevLineText)

        // Check what the previous line ends with
        val trimmedPrevLine = prevLineText.trimEnd()

        // If we're typing } or end, find the matching opening line's indent
        if (trimmedCurrentLine.startsWith("}") || trimmedCurrentLine.startsWith("end")) {
            val matchingIndent = findMatchingOpenIndent(document, lineNumber)
            if (matchingIndent != null) {
                return matchingIndent
            }
        }

        // After => or {, increase indent
        if (trimmedPrevLine.endsWith("=>") || trimmedPrevLine.endsWith("{")) {
            return prevIndent + "    "
        }

        // Otherwise, maintain previous line's indent
        return prevIndent
    }

    private fun getPrevLineIndent(line: String): String {
        val indent = StringBuilder()
        for (char in line) {
            if (char.isWhitespace()) {
                indent.append(char)
            } else {
                break
            }
        }
        return indent.toString()
    }

    private fun findMatchingOpenIndent(document: com.intellij.openapi.editor.Document, closingLineNumber: Int): String? {
        var depth = 1
        var currentLine = closingLineNumber - 1

        while (currentLine >= 0) {
            val lineStart = document.getLineStartOffset(currentLine)
            val lineEnd = document.getLineEndOffset(currentLine)
            val lineText = document.getText(com.intellij.openapi.util.TextRange(lineStart, lineEnd))
            val trimmed = lineText.trimEnd()

            // Check for closing keywords
            if (trimmed.endsWith("}") || trimmed.endsWith("end")) {
                depth++
            }

            // Check for opening keywords
            if (trimmed.endsWith("=>") || trimmed.endsWith("{")) {
                depth--
                if (depth == 0) {
                    return getPrevLineIndent(lineText)
                }
            }

            currentLine--
        }

        return null
    }

    override fun isSuitableFor(language: Language?): Boolean {
        return language == FlickLanguage
    }
}


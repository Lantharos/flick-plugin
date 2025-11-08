package com.lantharos.flick

import com.intellij.codeInsight.editorActions.enter.EnterHandlerDelegate
import com.intellij.codeInsight.editorActions.enter.EnterHandlerDelegateAdapter
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiFile

class FlickEnterHandler : EnterHandlerDelegateAdapter() {
    override fun preprocessEnter(
        file: PsiFile,
        editor: Editor,
        caretOffsetRef: Ref<Int>,
        caretAdvanceRef: Ref<Int>,
        dataContext: DataContext,
        originalHandler: EditorActionHandler?
    ): EnterHandlerDelegate.Result {
        if (file.fileType != FlickFileType) {
            return EnterHandlerDelegate.Result.Continue
        }

        val document = editor.document
        val caretOffset = caretOffsetRef.get()
        val lineNumber = document.getLineNumber(caretOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineEnd = document.getLineEndOffset(lineNumber)
        val currentLineText = document.getText(com.intellij.openapi.util.TextRange(lineStart, lineEnd))

        val trimmedLine = currentLineText.trimEnd()

        // Check if the current line ends with => or {
        if (trimmedLine.endsWith("=>") || trimmedLine.endsWith("{")) {
            // Get current indent
            val currentIndent = currentLineText.takeWhile { it.isWhitespace() }
            val newIndent = currentIndent + "    " // Add 4 spaces

            // Let the default handler insert the newline first
            originalHandler?.execute(editor, editor.caretModel.currentCaret, dataContext)

            // Then insert our indent
            val newCaretOffset = editor.caretModel.offset
            document.insertString(newCaretOffset, newIndent)
            editor.caretModel.moveToOffset(newCaretOffset + newIndent.length)

            return EnterHandlerDelegate.Result.Stop
        }

        return EnterHandlerDelegate.Result.Continue
    }
}


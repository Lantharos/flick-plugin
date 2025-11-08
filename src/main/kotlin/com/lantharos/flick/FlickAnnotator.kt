package com.lantharos.flick

import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.psi.PsiElement
import com.lantharos.flick.psi.*

class FlickAnnotator : Annotator {

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (element.containingFile.fileType != FlickFileType) return

        when (element) {
            // Highlight function names in declarations
            is FlickTaskName -> {
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.FUNCTION_DECLARATION)
                    .create()
            }

            // Highlight variable names in declarations
            is FlickVariableName -> {
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.LOCAL_VARIABLE)
                    .create()
            }

            // Highlight parameter names
            is FlickParameterName -> {
                holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                    .range(element)
                    .textAttributes(DefaultLanguageHighlighterColors.PARAMETER)
                    .create()
            }

            // Check variable references
            is FlickVariableReference -> {
                val reference = element.reference
                val resolved = reference?.resolve()

                if (resolved == null) {
                    // Check if this might be a function call by looking at parent
                    val parent = element.parent
                    val isFunctionCall = parent is FlickPostfixExpression &&
                                        parent.callSuffixList.isNotEmpty()

                    if (isFunctionCall) {
                        // This is a function call, check if function exists
                        if (!isFunctionDefined(element.text, element.containingFile)) {
                            holder.newAnnotation(HighlightSeverity.ERROR, "Unresolved function '${element.text}'")
                                .range(element)
                                .create()
                        } else {
                            // Highlight as function call
                            holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                                .range(element)
                                .textAttributes(DefaultLanguageHighlighterColors.FUNCTION_CALL)
                                .create()
                        }
                    } else {
                        // This is a variable reference
                        holder.newAnnotation(HighlightSeverity.ERROR, "Unresolved variable '${element.text}'")
                            .range(element)
                            .create()
                    }
                } else {
                    // Successfully resolved - check if it's a function
                    if (resolved is FlickTaskName) {
                        holder.newAnnotation(HighlightSeverity.INFORMATION, "")
                            .range(element)
                            .textAttributes(DefaultLanguageHighlighterColors.FUNCTION_CALL)
                            .create()
                    }
                }
            }
        }
    }

    private fun isFunctionDefined(name: String, file: PsiElement): Boolean {
        val tasks = com.intellij.psi.util.PsiTreeUtil.findChildrenOfType(file, FlickTaskDeclaration::class.java)
        return tasks.any { task ->
            val taskName = com.intellij.psi.util.PsiTreeUtil.findChildOfType(task, FlickTaskName::class.java)
            taskName?.text == name
        }
    }
}


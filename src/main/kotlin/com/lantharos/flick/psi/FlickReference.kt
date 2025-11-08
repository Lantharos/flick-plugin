package com.lantharos.flick.psi

import com.intellij.openapi.util.TextRange
import com.intellij.psi.*
import com.intellij.psi.util.PsiTreeUtil
import com.lantharos.flick.psi.impl.FlickReferenceElementImpl

class FlickReference(element: FlickReferenceElementImpl) : PsiReferenceBase<FlickReferenceElementImpl>(element, TextRange(0, element.textLength)) {

    override fun resolve(): PsiElement? {
        val refName = element.text
        val file = element.containingFile

        // Look for variable declarations
        PsiTreeUtil.findChildrenOfType(file, FlickVariableDeclaration::class.java).forEach { varDecl ->
            val varName = PsiTreeUtil.findChildOfType(varDecl, FlickVariableName::class.java)
            if (varName?.text == refName && varDecl.textRange.startOffset < element.textRange.startOffset) {
                return varName
            }
        }

        // Look for function declarations
        PsiTreeUtil.findChildrenOfType(file, FlickTaskDeclaration::class.java).forEach { task ->
            val taskName = PsiTreeUtil.findChildOfType(task, FlickTaskName::class.java)
            if (taskName?.text == refName) {
                return taskName
            }
        }

        // Look for parameters in enclosing function
        val enclosingTask = PsiTreeUtil.getParentOfType(element, FlickTaskDeclaration::class.java)
        enclosingTask?.let { task ->
            PsiTreeUtil.findChildrenOfType(task, FlickParameterName::class.java).forEach { param ->
                if (param.text == refName) {
                    return param
                }
            }
        }

        // Look for loop variables
        val enclosingEachLoop = PsiTreeUtil.getParentOfType(element, FlickEachLoop::class.java)
        enclosingEachLoop?.let { loop ->
            // Extract loop variable from the loop structure
            val loopText = loop.text
            val match = Regex("""each\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in""").find(loopText)
            if (match?.groupValues?.get(1) == refName) {
                return loop.firstChild?.nextSibling // Return the identifier after 'each'
            }
        }

        val enclosingMarchLoop = PsiTreeUtil.getParentOfType(element, FlickMarchLoop::class.java)
        enclosingMarchLoop?.let { loop ->
            val loopText = loop.text
            val match = Regex("""march\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from""").find(loopText)
            if (match?.groupValues?.get(1) == refName) {
                return loop.firstChild?.nextSibling
            }
        }

        return null
    }

    override fun getVariants(): Array<Any> {
        val variants = mutableListOf<PsiElement>()
        val file = element.containingFile

        // Add all visible variables
        PsiTreeUtil.findChildrenOfType(file, FlickVariableName::class.java).forEach { varName ->
            variants.add(varName)
        }

        // Add all functions
        PsiTreeUtil.findChildrenOfType(file, FlickTaskName::class.java).forEach { taskName ->
            variants.add(taskName)
        }

        return variants.toTypedArray()
    }
}


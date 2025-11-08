package com.lantharos.flick

import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.util.PsiTreeUtil
import com.lantharos.flick.psi.*

/**
 * Semantic analyzer using Grammar-Kit generated PSI elements
 */
class FlickSemanticAnalyzer(private val file: PsiFile) {

    data class Symbol(
        val name: String,
        val kind: SymbolKind,
        val element: PsiElement
    )

    enum class SymbolKind {
        VARIABLE, FUNCTION, PARAMETER, CLASS, LOOP_VARIABLE, FIELD
    }

    fun getSymbolsInScope(offset: Int, element: PsiElement): List<Symbol> {
        val symbols = mutableListOf<Symbol>()

        // Find all variable declarations in file before this point
        PsiTreeUtil.findChildrenOfType(file, FlickVariableDeclaration::class.java).forEach { varDecl ->
            if (varDecl.textRange.startOffset < offset) {
                val identifier = PsiTreeUtil.findChildOfType(varDecl, PsiElement::class.java)
                identifier?.let {
                    symbols.add(Symbol(it.text, SymbolKind.VARIABLE, varDecl))
                }
            }
        }

        // Find all function declarations in the entire file
        PsiTreeUtil.findChildrenOfType(file, FlickTaskDeclaration::class.java).forEach { task ->
            val identifier = task.firstChild?.nextSibling // TASK keyword, then identifier
            identifier?.let {
                symbols.add(Symbol(it.text, SymbolKind.FUNCTION, task))
            }
        }

        // Find all group/class declarations before this point
        PsiTreeUtil.findChildrenOfType(file, FlickGroupDeclaration::class.java).forEach { group ->
            if (group.textRange.startOffset < offset) {
                val identifier = group.firstChild?.nextSibling
                identifier?.let {
                    symbols.add(Symbol(it.text, SymbolKind.CLASS, group))
                }
            }
        }

        // Find parameters in the enclosing function
        val enclosingTask = PsiTreeUtil.getParentOfType(element, FlickTaskDeclaration::class.java)
        enclosingTask?.let { task ->
            PsiTreeUtil.findChildrenOfType(task, FlickParameter::class.java).forEach { param ->
                val paramName = extractParameterName(param)
                paramName?.let {
                    symbols.add(Symbol(it, SymbolKind.PARAMETER, param))
                }
            }
        }

        // Find loop variables in enclosing loops
        val enclosingEachLoop = PsiTreeUtil.getParentOfType(element, FlickEachLoop::class.java)
        enclosingEachLoop?.let { loop ->
            val loopVar = extractLoopVariable(loop)
            loopVar?.let {
                symbols.add(Symbol(it, SymbolKind.LOOP_VARIABLE, loop))
            }
        }

        val enclosingMarchLoop = PsiTreeUtil.getParentOfType(element, FlickMarchLoop::class.java)
        enclosingMarchLoop?.let { loop ->
            val loopVar = extractLoopVariable(loop)
            loopVar?.let {
                symbols.add(Symbol(it, SymbolKind.LOOP_VARIABLE, loop))
            }
        }

        return symbols
    }

    fun isIdentifierDefined(name: String, offset: Int, element: PsiElement): Boolean {
        return getSymbolsInScope(offset, element).any { it.name == name }
    }

    fun isFunctionDefined(name: String): Boolean {
        return PsiTreeUtil.findChildrenOfType(file, FlickTaskDeclaration::class.java).any {
            val identifier = it.firstChild?.nextSibling
            identifier?.text == name
        }
    }

    fun isClassDefined(name: String, offset: Int): Boolean {
        return PsiTreeUtil.findChildrenOfType(file, FlickGroupDeclaration::class.java).any {
            it.textRange.startOffset < offset && it.firstChild?.nextSibling?.text == name
        }
    }

    fun getClassMethods(className: String): List<String> {
        val methods = mutableListOf<String>()

        PsiTreeUtil.findChildrenOfType(file, FlickGroupDeclaration::class.java).forEach { group ->
            if (group.firstChild?.nextSibling?.text == className) {
                PsiTreeUtil.findChildrenOfType(group, FlickTaskDeclaration::class.java).forEach { task ->
                    task.firstChild?.nextSibling?.text?.let { methods.add(it) }
                }
            }
        }

        return methods
    }

    fun isMethodDefined(className: String, methodName: String): Boolean {
        return getClassMethods(className).contains(methodName)
    }

    fun isPluginDeclared(pluginName: String): Boolean {
        return PsiTreeUtil.findChildrenOfType(file, FlickDeclareStatement::class.java).any {
            val identifier = it.firstChild?.nextSibling
            identifier?.text == pluginName
        }
    }

    fun isInDeclarationContext(element: PsiElement): Boolean {
        // Check if element is part of a declaration
        return PsiTreeUtil.getParentOfType(element,
            FlickVariableDeclaration::class.java,
            FlickTaskDeclaration::class.java,
            FlickParameter::class.java,
            FlickGroupDeclaration::class.java,
            FlickEachLoop::class.java,
            FlickMarchLoop::class.java
        ) != null
    }

    fun isAfterSlash(element: PsiElement): Boolean {
        val prevSibling = element.prevSibling
        return prevSibling?.text?.trim() == "/"
    }

    private fun extractParameterName(param: FlickParameter): String? {
        // Parameter structure: num(varName) or literal(varName)
        val text = param.text
        val match = Regex("""(?:num|literal|[A-Z][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)""").find(text)
        return match?.groupValues?.get(1)
    }

    private fun extractLoopVariable(loop: PsiElement): String? {
        // Each/March loop: each varName in ... or march varName from ...
        val text = loop.text
        val match = Regex("""(?:each|march)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:in|from)""").find(text)
        return match?.groupValues?.get(1)
    }
}


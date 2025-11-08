package com.lantharos.flick.editor

import com.intellij.formatting.*
import com.intellij.lang.ASTNode
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFile
import com.intellij.psi.codeStyle.CodeStyleSettings

class FlickFormattingModelBuilder : FormattingModelBuilder {
    override fun createModel(formattingContext: FormattingContext): FormattingModel {
        val settings = formattingContext.codeStyleSettings
        val element = formattingContext.psiElement

        return FormattingModelProvider.createFormattingModelForPsiFile(
            element.containingFile,
            FlickBlock(element.node, null, Indent.getNoneIndent(), null, settings),
            settings
        )
    }

    override fun getRangeAffectingIndent(file: PsiFile, offset: Int, elementAtOffset: ASTNode): TextRange? {
        return null
    }
}

class FlickBlock(
    private val node: ASTNode,
    private val alignment: Alignment?,
    private val indent: Indent?,
    private val wrap: Wrap?,
    private val settings: CodeStyleSettings
) : ASTBlock {

    override fun getNode() = node
    override fun getTextRange(): TextRange = node.textRange
    override fun getAlignment() = alignment
    override fun getIndent() = indent
    override fun getWrap() = wrap

    override fun getSubBlocks(): List<Block> {
        val blocks = mutableListOf<Block>()
        var child = node.firstChildNode

        while (child != null) {
            if (child.textLength > 0 && child.text.trim().isNotEmpty()) {
                blocks.add(createChildBlock(child))
            }
            child = child.treeNext
        }

        return blocks
    }

    private fun createChildBlock(child: ASTNode): Block {
        val childText = child.text.trim()

        val childIndent = when {
            // Closing braces and 'end' should be dedented to match the opening line
            childText == "}" || childText == "end" || childText.startsWith("}") || childText.startsWith("end") -> {
                Indent.getNoneIndent()
            }
            // Indent after =>
            isAfterArrow() -> Indent.getNormalIndent()
            // Indent after {
            isAfterOpenBrace() -> Indent.getNormalIndent()
            // Indent inside blocks
            isInsideBlock() -> Indent.getNormalIndent()
            else -> Indent.getNoneIndent()
        }

        return FlickBlock(child, null, childIndent, null, settings)
    }

    private fun isAfterArrow(): Boolean {
        val prevSibling = node.treePrev
        return prevSibling?.text?.trimEnd()?.endsWith("=>") == true
    }

    private fun isAfterOpenBrace(): Boolean {
        val prevSibling = node.treePrev
        return prevSibling?.text?.trimEnd()?.endsWith("{") == true
    }

    private fun isInsideBlock(): Boolean {
        var parent = node.treeParent
        while (parent != null) {
            val text = parent.text
            // Check for => ... end blocks
            if (text.contains("=>") && text.contains("end")) {
                return true
            }
            // Check for { ... } blocks (for groups, blueprints, etc)
            if (text.contains("{") && text.contains("}")) {
                return true
            }
            parent = parent.treeParent
        }
        return false
    }

    override fun getSpacing(child1: Block?, child2: Block): Spacing? {
        return Spacing.createSpacing(0, 1, 0, true, 2)
    }

    override fun getChildAttributes(newChildIndex: Int): ChildAttributes {
        val subBlocks = subBlocks

        // If we have sub-blocks, check the context of where we are
        if (subBlocks.isNotEmpty()) {
            // Check if the previous line ends with => or { (indicating a block start - increase indent)
            if (newChildIndex > 0 && newChildIndex <= subBlocks.size) {
                val prevBlock = subBlocks[newChildIndex - 1]
                val prevText = prevBlock.textRange.substring(node.text).trimEnd()

                // Increase indent after => or {
                if (prevText.endsWith("=>") || prevText.endsWith("{")) {
                    return ChildAttributes(Indent.getNormalIndent(), null)
                }
            }

            // If we have at least one sub-block, use its indent to maintain the level
            if (newChildIndex > 0) {
                val prevBlock = subBlocks[minOf(newChildIndex - 1, subBlocks.size - 1)]
                val prevIndent = prevBlock.indent
                if (prevIndent != null && prevIndent != Indent.getNoneIndent()) {
                    return ChildAttributes(prevIndent, null)
                }
            }
        }

        // Check if we're inside a block - if so, maintain normal indent
        val nodeText = node.text
        val hasOpenBlock = nodeText.contains("=>") || nodeText.contains("{")
        val hasCloseBlock = nodeText.contains("end") || nodeText.contains("}")

        // If we have an open block but no close, we're inside it
        if (hasOpenBlock && !hasCloseBlock) {
            return ChildAttributes(Indent.getNormalIndent(), null)
        }

        // If current node has indent, maintain it
        if (indent != null && indent != Indent.getNoneIndent()) {
            return ChildAttributes(indent, null)
        }

        // Default: no indent
        return ChildAttributes(Indent.getNoneIndent(), null)
    }


    override fun isIncomplete() = false
    override fun isLeaf() = node.firstChildNode == null
}


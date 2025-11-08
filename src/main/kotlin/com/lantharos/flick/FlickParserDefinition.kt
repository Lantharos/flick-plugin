package com.lantharos.flick

import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet
import com.lantharos.flick.psi.FlickTypes

class FlickParserDefinition : ParserDefinition {
    companion object {
        val FILE = IFileElementType(FlickLanguage)
        val COMMENTS = TokenSet.create(FlickTokenTypes.COMMENT)
        val STRINGS = TokenSet.create(FlickTokenTypes.STRING)
    }

    override fun createLexer(project: Project?): Lexer = FlickLexer()

    override fun createParser(project: Project?): PsiParser = com.lantharos.flick.parser.FlickParser()

    override fun getFileNodeType() = FILE

    override fun getCommentTokens() = COMMENTS

    override fun getStringLiteralElements() = STRINGS

    override fun createElement(node: ASTNode?): PsiElement = FlickTypes.Factory.createElement(node!!)

    override fun createFile(viewProvider: FileViewProvider): PsiFile = FlickFile(viewProvider)
}


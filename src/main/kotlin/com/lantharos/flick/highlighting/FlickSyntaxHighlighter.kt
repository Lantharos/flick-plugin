package com.lantharos.flick.highlighting

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.psi.tree.IElementType
import com.intellij.openapi.editor.HighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey.createTextAttributesKey
import com.lantharos.flick.parser.FlickLexer
import com.lantharos.flick.parser.FlickTokenTypes

class FlickSyntaxHighlighter : SyntaxHighlighterBase() {

    companion object {
        val KEYWORD = createTextAttributesKey(
            "FLICK_KEYWORD",
            DefaultLanguageHighlighterColors.KEYWORD
        )

        val COMMENT = createTextAttributesKey(
            "FLICK_COMMENT",
            DefaultLanguageHighlighterColors.LINE_COMMENT
        )

        val STRING = createTextAttributesKey(
            "FLICK_STRING",
            DefaultLanguageHighlighterColors.STRING
        )

        val NUMBER = createTextAttributesKey(
            "FLICK_NUMBER",
            DefaultLanguageHighlighterColors.NUMBER
        )

        // Gold/Yellow for special operators (=>, :=, =, ->)
        val ARROW_OPERATOR = createTextAttributesKey(
            "FLICK_ARROW_OPERATOR",
            DefaultLanguageHighlighterColors.KEYWORD  // Will appear as keyword color (purple/blue)
        )

        val ASSIGN_OPERATOR = createTextAttributesKey(
            "FLICK_ASSIGN_OPERATOR",
            DefaultLanguageHighlighterColors.OPERATION_SIGN
        )

        // Standard operators (+, -, *, /)
        val ARITHMETIC_OPERATOR = createTextAttributesKey(
            "FLICK_ARITHMETIC_OPERATOR",
            DefaultLanguageHighlighterColors.OPERATION_SIGN
        )

        val COMPARISON_OPERATOR = createTextAttributesKey(
            "FLICK_COMPARISON_OPERATOR",
            DefaultLanguageHighlighterColors.OPERATION_SIGN
        )

        val PUNCTUATION = createTextAttributesKey(
            "FLICK_PUNCTUATION",
            DefaultLanguageHighlighterColors.DOT
        )

        val IDENTIFIER = createTextAttributesKey(
            "FLICK_IDENTIFIER",
            DefaultLanguageHighlighterColors.IDENTIFIER
        )

        val BRACKETS = createTextAttributesKey(
            "FLICK_BRACKETS",
            DefaultLanguageHighlighterColors.BRACKETS
        )

        val BAD_CHARACTER = createTextAttributesKey(
            "FLICK_BAD_CHARACTER",
            HighlighterColors.BAD_CHARACTER
        )
    }

    override fun getHighlightingLexer() = FlickLexer()

    override fun getTokenHighlights(tokenType: IElementType?): Array<TextAttributesKey> {
        return when (tokenType) {
            FlickTokenTypes.KEYWORD -> arrayOf(KEYWORD)
            FlickTokenTypes.COMMENT -> arrayOf(COMMENT)
            FlickTokenTypes.STRING -> arrayOf(STRING)
            FlickTokenTypes.NUMBER -> arrayOf(NUMBER)
            FlickTokenTypes.ARROW_OPERATOR -> arrayOf(ARROW_OPERATOR)
            FlickTokenTypes.ASSIGN_OPERATOR -> arrayOf(ASSIGN_OPERATOR)
            FlickTokenTypes.ARITHMETIC_OPERATOR -> arrayOf(ARITHMETIC_OPERATOR)
            FlickTokenTypes.COMPARISON_OPERATOR -> arrayOf(COMPARISON_OPERATOR)
            FlickTokenTypes.PUNCTUATION -> arrayOf(PUNCTUATION)
            FlickTokenTypes.IDENTIFIER -> arrayOf(IDENTIFIER)
            FlickTokenTypes.LPAREN, FlickTokenTypes.RPAREN,
            FlickTokenTypes.LBRACE, FlickTokenTypes.RBRACE,
            FlickTokenTypes.LBRACKET, FlickTokenTypes.RBRACKET -> arrayOf(BRACKETS)
            FlickTokenTypes.BAD_CHARACTER -> arrayOf(BAD_CHARACTER)
            else -> emptyArray()
        }
    }
}


package com.lantharos.flick.editor

import com.intellij.lang.BracePair
import com.intellij.lang.PairedBraceMatcher
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IElementType
import com.lantharos.flick.parser.FlickTokenTypes

class FlickBraceMatcher : PairedBraceMatcher {
    override fun getPairs() = arrayOf(
        BracePair(FlickTokenTypes.LPAREN, FlickTokenTypes.RPAREN, false),
        BracePair(FlickTokenTypes.LBRACE, FlickTokenTypes.RBRACE, true),
        BracePair(FlickTokenTypes.LBRACKET, FlickTokenTypes.RBRACKET, false)
    )

    override fun isPairedBracesAllowedBeforeType(lbraceType: IElementType, contextType: IElementType?): Boolean {
        return true
    }

    override fun getCodeConstructStart(file: PsiFile, openingBraceOffset: Int): Int {
        return openingBraceOffset
    }
}


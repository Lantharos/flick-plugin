package com.lantharos.flick.psi

import com.intellij.psi.tree.IElementType
import com.lantharos.flick.FlickLanguage

class FlickTokenType(debugName: String) : IElementType(debugName, FlickLanguage) {
    override fun toString(): String = "FlickTokenType." + super.toString()
}


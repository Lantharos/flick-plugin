package com.lantharos.flick.psi.impl

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.lang.ASTNode
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReference
import com.lantharos.flick.psi.FlickNamedElement
import com.lantharos.flick.psi.FlickTypes

abstract class FlickNamedElementImpl(node: ASTNode) : ASTWrapperPsiElement(node), FlickNamedElement {

    override fun getName(): String? {
        return getNameIdentifier()?.text
    }

    override fun setName(name: String): PsiElement {
        // TODO: Implement rename
        return this
    }

    fun getNameIdentifier(): PsiElement? {
        return findChildByType(FlickTypes.IDENTIFIER)
    }

    override fun getReference(): PsiReference? {
        return null
    }
}


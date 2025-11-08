package com.lantharos.flick.psi.impl

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.lang.ASTNode
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiReference
import com.lantharos.flick.psi.FlickReference
import com.lantharos.flick.psi.FlickReferenceElement
import com.lantharos.flick.psi.FlickTypes

abstract class FlickReferenceElementImpl(node: ASTNode) : ASTWrapperPsiElement(node), FlickReferenceElement {

    override fun getReference(): FlickReference {
        return FlickReference(this)
    }
}


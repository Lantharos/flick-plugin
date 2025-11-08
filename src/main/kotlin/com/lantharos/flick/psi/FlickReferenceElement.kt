package com.lantharos.flick.psi

import com.intellij.psi.PsiElement

interface FlickReferenceElement : PsiElement {
    override fun getReference(): FlickReference?
}


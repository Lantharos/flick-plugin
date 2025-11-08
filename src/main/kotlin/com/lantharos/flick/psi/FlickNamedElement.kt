package com.lantharos.flick.psi

import com.intellij.psi.PsiElement
import com.intellij.psi.PsiNamedElement
import com.intellij.psi.PsiReference

interface FlickNamedElement : PsiNamedElement {
    override fun getReference(): PsiReference?
}


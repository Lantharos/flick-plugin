package com.lantharos.flick.core

import com.intellij.extapi.psi.PsiFileBase
import com.intellij.psi.FileViewProvider

class FlickFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, FlickLanguage) {
    override fun getFileType() = FlickFileType
    override fun toString() = "Flick File"
}


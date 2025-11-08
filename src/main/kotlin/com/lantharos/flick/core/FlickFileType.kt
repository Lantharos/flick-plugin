package com.lantharos.flick.core

import com.intellij.openapi.fileTypes.LanguageFileType
import javax.swing.Icon

object FlickFileType : LanguageFileType(FlickLanguage) {
    override fun getName() = "Flick"
    override fun getDescription() = "Flick language file"
    override fun getDefaultExtension() = "fk"
    override fun getIcon(): Icon = FlickIcons.FILE
}


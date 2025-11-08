package com.lantharos.flick

import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.LazyRunConfigurationProducer
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.openapi.util.Ref
import com.intellij.psi.PsiElement

class FlickRunConfigurationProducer : LazyRunConfigurationProducer<FlickRunConfiguration>() {

    override fun getConfigurationFactory(): ConfigurationFactory {
        return FlickConfigurationFactory(FlickConfigurationType())
    }

    override fun isConfigurationFromContext(
        configuration: FlickRunConfiguration,
        context: ConfigurationContext
    ): Boolean {
        val file = context.location?.virtualFile ?: return false
        return file.extension == "fk" && configuration.scriptPath == file.path
    }

    override fun setupConfigurationFromContext(
        configuration: FlickRunConfiguration,
        context: ConfigurationContext,
        sourceElement: Ref<PsiElement>
    ): Boolean {
        val file = context.location?.virtualFile ?: return false
        if (file.extension != "fk") return false

        configuration.scriptPath = file.path
        configuration.name = "Run ${file.name}"
        return true
    }
}


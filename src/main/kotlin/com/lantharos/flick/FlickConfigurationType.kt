package com.lantharos.flick

import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.ConfigurationType
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.openapi.project.Project
import javax.swing.Icon

class FlickConfigurationType : ConfigurationType {
    override fun getDisplayName() = "Flick"
    override fun getConfigurationTypeDescription() = "Flick run configuration"
    override fun getIcon(): Icon = FlickIcons.FILE
    override fun getId() = "FlickRunConfiguration"
    override fun getConfigurationFactories(): Array<ConfigurationFactory> = arrayOf(FlickConfigurationFactory(this))
}

class FlickConfigurationFactory(type: ConfigurationType) : ConfigurationFactory(type) {
    override fun getId() = "Flick"
    override fun createTemplateConfiguration(project: Project): RunConfiguration {
        return FlickRunConfiguration(project, this, "Flick")
    }
}


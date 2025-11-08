package com.lantharos.flick.run

import com.intellij.execution.Executor
import com.intellij.execution.configurations.*
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.process.ProcessTerminatedListener
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import org.jdom.Element
import javax.swing.*

class FlickRunConfiguration(
    project: Project,
    factory: ConfigurationFactory,
    name: String
) : RunConfigurationBase<RunConfigurationOptions>(project, factory, name) {

    var scriptPath: String = ""

    override fun getConfigurationEditor(): SettingsEditor<out RunConfiguration> {
        return FlickSettingsEditor()
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState {
        return object : CommandLineState(environment) {
            override fun startProcess(): ProcessHandler {
                // On Windows, use cmd.exe to run flick (which is a global npm package)
                val commandLine = if (System.getProperty("os.name").contains("Windows", ignoreCase = true)) {
                    GeneralCommandLine("cmd.exe", "/c", "flick", "run", scriptPath)
                } else {
                    GeneralCommandLine("flick", "run", scriptPath)
                }

                // Set working directory to the script's directory
                val scriptFile = java.io.File(scriptPath)
                val workDir = scriptFile.parentFile?.absolutePath ?: project.basePath
                commandLine.withWorkDirectory(workDir)

                val processHandler = ProcessHandlerFactory.getInstance()
                    .createColoredProcessHandler(commandLine)
                ProcessTerminatedListener.attach(processHandler)
                return processHandler
            }
        }
    }


    override fun readExternal(element: Element) {
        super.readExternal(element)
        scriptPath = element.getAttributeValue("scriptPath") ?: ""
    }

    override fun writeExternal(element: Element) {
        super.writeExternal(element)
        element.setAttribute("scriptPath", scriptPath)
    }
}


class FlickSettingsEditor : SettingsEditor<FlickRunConfiguration>() {
    private val panel = JPanel()
    private val scriptField = JTextField(40)

    init {
        panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
        val scriptPanel = JPanel()
        scriptPanel.add(JLabel("Script path:"))
        scriptPanel.add(scriptField)
        panel.add(scriptPanel)
    }

    override fun createEditor(): JComponent = panel

    override fun resetEditorFrom(config: FlickRunConfiguration) {
        scriptField.text = config.scriptPath
    }

    override fun applyEditorTo(config: FlickRunConfiguration) {
        config.scriptPath = scriptField.text
    }
}


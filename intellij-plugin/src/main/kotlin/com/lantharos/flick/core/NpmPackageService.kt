package com.lantharos.flick.core

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.google.gson.JsonParser
import java.io.File

/**
 * Service to handle npm package integration and provide intellisense for imported symbols
 */
object NpmPackageService {

    /**
     * Get all imports from a Flick file
     * Returns a map of imported symbols to their package names
     * Example: import { createClient } from '@supabase/supabase-js'
     * Returns: {"createClient" to "@supabase/supabase-js"}
     */
    fun getImportsFromFile(fileText: String): Map<String, String> {
        val imports = mutableMapOf<String, String>()

        // Match: import { symbol1, symbol2, ... } from 'package-name'
        val importPattern = Regex("""import\s*\{\s*([^}]+)\}\s*from\s*['"]([^'"]+)['"]""")

        importPattern.findAll(fileText).forEach { match ->
            val symbolsText = match.groupValues[1]
            val packageName = match.groupValues[2]

            // Split symbols by comma and trim
            symbolsText.split(",").forEach { symbol ->
                val trimmedSymbol = symbol.trim()
                if (trimmedSymbol.isNotEmpty()) {
                    imports[trimmedSymbol] = packageName
                }
            }
        }

        // Also match: import symbol from 'package-name' (default imports)
        val defaultImportPattern = Regex("""import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from\s*['"]([^'"]+)['"]""")
        defaultImportPattern.findAll(fileText).forEach { match ->
            val symbol = match.groupValues[1]
            val packageName = match.groupValues[2]
            imports[symbol] = packageName
        }

        return imports
    }

    /**
     * Check if a package is installed in the project's node_modules
     */
    fun isPackageInstalled(project: Project, packageName: String): Boolean {
        val basePath = project.basePath ?: return false
        val nodeModulesPath = File(basePath, "node_modules/$packageName")
        return nodeModulesPath.exists() && nodeModulesPath.isDirectory
    }

    /**
     * Get package.json location for the project
     */
    fun getPackageJsonFile(project: Project): File? {
        val basePath = project.basePath ?: return null
        val packageJson = File(basePath, "package.json")
        return if (packageJson.exists()) packageJson else null
    }

    /**
     * Check if a package is listed in package.json dependencies
     */
    fun isPackageInDependencies(project: Project, packageName: String): Boolean {
        val packageJsonFile = getPackageJsonFile(project) ?: return false

        try {
            val content = packageJsonFile.readText()
            val jsonElement = JsonParser.parseString(content)

            if (!jsonElement.isJsonObject) return false
            val json = jsonElement.asJsonObject

            // Check in dependencies
            if (json.has("dependencies")) {
                val deps = json.getAsJsonObject("dependencies")
                if (deps.has(packageName)) return true
            }

            // Check in devDependencies
            if (json.has("devDependencies")) {
                val devDeps = json.getAsJsonObject("devDependencies")
                if (devDeps.has(packageName)) return true
            }
        } catch (e: Exception) {
            // If parsing fails, assume false
            return false
        }

        return false
    }

    /**
     * Get all exported symbols from a package (simplified - would need TypeScript parsing for real implementation)
     */
    fun getPackageExports(project: Project, packageName: String): Set<String> {
        // This is a simplified version. In a real implementation, you would:
        // 1. Parse the package's index.d.ts or main file
        // 2. Extract all exported symbols
        // 3. Cache the results

        // For now, return an empty set - the import statement itself will define what's available
        return emptySet()
    }
}


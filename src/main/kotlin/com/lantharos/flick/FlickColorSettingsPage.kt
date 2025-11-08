package com.lantharos.flick

import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.options.colors.AttributesDescriptor
import com.intellij.openapi.options.colors.ColorDescriptor
import com.intellij.openapi.options.colors.ColorSettingsPage
import javax.swing.Icon

class FlickColorSettingsPage : ColorSettingsPage {

    companion object {
        private val DESCRIPTORS = arrayOf(
            AttributesDescriptor("Keyword", FlickSyntaxHighlighter.KEYWORD),
            AttributesDescriptor("Comment", FlickSyntaxHighlighter.COMMENT),
            AttributesDescriptor("String", FlickSyntaxHighlighter.STRING),
            AttributesDescriptor("Number", FlickSyntaxHighlighter.NUMBER),
            AttributesDescriptor("Arrow Operator (=>, ->)", FlickSyntaxHighlighter.ARROW_OPERATOR),
            AttributesDescriptor("Assignment Operator (:=, =)", FlickSyntaxHighlighter.ASSIGN_OPERATOR),
            AttributesDescriptor("Arithmetic Operator (+, -, *, /)", FlickSyntaxHighlighter.ARITHMETIC_OPERATOR),
            AttributesDescriptor("Comparison Operator (==, !=, <, >)", FlickSyntaxHighlighter.COMPARISON_OPERATOR),
            AttributesDescriptor("Identifier", FlickSyntaxHighlighter.IDENTIFIER),
            AttributesDescriptor("Brackets", FlickSyntaxHighlighter.BRACKETS),
            AttributesDescriptor("Punctuation", FlickSyntaxHighlighter.PUNCTUATION),
        )

        private val DEMO_TEXT = """
            # Flick Language Demo
            
            # Variables
            free name = "Alice"
            lock maxValue = 100
            
            # Group (class)
            group Player {
                free num health = 100
                free literal playerName
                
                task greet =>
                    print "Hello, " and playerName
                end
                
                task getHealth =>
                    give health
                end
            }
            
            # Create instance
            free Player p = Player "Bob"
            p/greet
            free hp = p/getHealth
            
            # Control flow
            assume health > 50 =>
                print "Healthy"
            otherwise =>
                print "Low health"
            end
            
            # Ternary expression
            free status = assume hp >= 100 => "Full", otherwise => "Damaged"
            
            # Loops
            each item in items =>
                print item
            end
            
            march i from 1 to 10 =>
                print i
            end
            
            # Web routing
            route GET "/" =>
                respond "Welcome"
            end
            
            # Math
            free result = 10 + 20 * 3
            free isEqual = result == 70
        """.trimIndent()
    }

    override fun getAttributeDescriptors() = DESCRIPTORS
    override fun getColorDescriptors(): Array<ColorDescriptor> = ColorDescriptor.EMPTY_ARRAY
    override fun getDisplayName() = "Flick"
    override fun getIcon(): Icon? = FlickIcons.FILE
    override fun getHighlighter(): SyntaxHighlighter = FlickSyntaxHighlighter()
    override fun getDemoText() = DEMO_TEXT
    override fun getAdditionalHighlightingTagToDescriptorMap(): Map<String, TextAttributesKey>? = null
}


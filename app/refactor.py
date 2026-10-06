import sys, re

file_path = sys.argv[1]

with open(file_path, 'r') as f:
    content = f.read()

# 1. Check if useTheme is imported, if not add it
if 'useTheme' not in content:
    content = re.sub(
        r"(import React.*?from 'react';)", 
        r"\1\nimport { useTheme } from '../../context/ThemeContext';", 
        content, 
        count=1
    )

# 2. Convert const styles = StyleSheet.create({ to const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({
if 'const styles = StyleSheet.create({' in content:
    content = content.replace('const styles = StyleSheet.create({', 'const getStyles = (colors: any, isDark: boolean) => StyleSheet.create({')

# 3. Convert const ds = StyleSheet.create({ to const getDs = (colors: any, isDark: boolean) => StyleSheet.create({
if 'const ds = StyleSheet.create({' in content:
    content = content.replace('const ds = StyleSheet.create({', 'const getDs = (colors: any, isDark: boolean) => StyleSheet.create({')

# 4. Convert const bulkStyles = StyleSheet.create({ to const getBulkStyles = (colors: any, isDark: boolean) => StyleSheet.create({
if 'const bulkStyles = StyleSheet.create({' in content:
    content = content.replace('const bulkStyles = StyleSheet.create({', 'const getBulkStyles = (colors: any, isDark: boolean) => StyleSheet.create({')


# Replace hex colors in the entire file EXCEPT where they are strictly needed? No, let's just regex replace inside styles objects or globally.
replacements = [
    (r"backgroundColor:\s*['\"]#(?:fff|ffffff)['\"]", r"backgroundColor: colors.surface"),
    (r"color:\s*['\"]#(?:fff|ffffff)['\"]", r"color: isDark ? colors.surface : '#fff'"), # wait, white text on dark bg vs primary button?
    (r"['\"]#(?:111|222|333|202124|3c4043|000|000000)['\"]", r"colors.onSurface"),
    (r"['\"]#(?:1a73e8|2196F3)['\"]", r"colors.primary"),
    (r"['\"]#(?:f1f3f4|e8eaed|eeeeee|eee|e0e0e0)['\"]", r"colors.surfaceVariant"),
    (r"['\"]#(?:5f6368|666|666666|888|888888|80868b|9aa0a6|d0d0d0)['\"]", r"colors.onSurfaceVariant"),
    (r"['\"]#(?:d93025)['\"]", r"colors.error"),
]

for pattern, repl in replacements:
    content = re.sub(pattern, repl, content)

with open(file_path, 'w') as f:
    f.write(content)

print(f"Refactored {file_path}")

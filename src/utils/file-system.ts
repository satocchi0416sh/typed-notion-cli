import { promises as fs } from 'fs';
import { dirname, resolve, extname, isAbsolute, join } from 'path';
import { FileSystemError } from './error-handling.js';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Create directory recursively if it doesn't exist
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileSystemError(
      `Failed to create directory: ${dirPath}`,
      'Check directory permissions and available disk space',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Read file content as string
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new FileSystemError(
      `Failed to read file: ${filePath}`,
      'Check if the file exists and you have read permissions',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Write content to file, creating directories if needed
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    await ensureDirectory(dir);

    // Write file
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new FileSystemError(
      `Failed to write file: ${filePath}`,
      'Check directory permissions and available disk space',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Copy file to destination, creating directories if needed
 */
export async function copyFile(srcPath: string, destPath: string): Promise<void> {
  try {
    // Ensure destination directory exists
    const destDir = dirname(destPath);
    await ensureDirectory(destDir);

    // Copy file
    await fs.copyFile(srcPath, destPath);
  } catch (error) {
    throw new FileSystemError(
      `Failed to copy file from ${srcPath} to ${destPath}`,
      'Check source file exists and destination directory is writable',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Find files matching a pattern in a directory
 */
export async function findFiles(
  dirPath: string,
  pattern: RegExp,
  recursive = false
): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dirPath, entry.name);

      if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        const subResults = await findFiles(fullPath, pattern, recursive);
        results.push(...subResults);
      }
    }
  } catch (error) {
    throw new FileSystemError(
      `Failed to search directory: ${dirPath}`,
      'Check if the directory exists and you have read permissions',
      error instanceof Error ? error : undefined
    );
  }

  return results;
}

/**
 * Get file extension without the dot
 */
export function getFileExtension(filePath: string): string {
  return extname(filePath).slice(1);
}

/**
 * Check if a file path has a specific extension
 */
export function hasExtension(filePath: string, extension: string): boolean {
  return getFileExtension(filePath).toLowerCase() === extension.toLowerCase();
}

/**
 * Validate that a file path is safe (no directory traversal)
 */
export function validateFilePath(filePath: string, allowedDirectory?: string): boolean {
  const resolvedPath = resolve(filePath);

  // Check for directory traversal
  if (filePath.includes('..')) {
    return false;
  }

  // Check if within allowed directory
  if (allowedDirectory) {
    const resolvedAllowedDir = resolve(allowedDirectory);
    return resolvedPath.startsWith(resolvedAllowedDir);
  }

  return true;
}

/**
 * Create a backup of an existing file
 */
export async function createBackup(filePath: string): Promise<string> {
  if (!(await fileExists(filePath))) {
    throw new FileSystemError(
      `Cannot create backup: file does not exist: ${filePath}`,
      'Check if the file path is correct'
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;

  await copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    throw new FileSystemError(
      `Failed to get file size: ${filePath}`,
      'Check if the file exists and you have read permissions',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Alias for ensureDirectory for consistency
 */
export const ensureDir = ensureDirectory;

/**
 * Write configuration file
 */
export async function writeConfigFile(filePath: string, content: string): Promise<void> {
  return writeFile(filePath, content);
}

/**
 * Write environment file with restricted permissions
 */
export async function writeEnvFile(filePath: string, content: string): Promise<void> {
  const fullPath = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

  try {
    await writeFile(fullPath, content);
    // Set restrictive permissions for .env files (owner read/write only)
    await fs.chmod(fullPath, 0o600);
  } catch (error) {
    throw new FileSystemError(
      'Failed to write .env file',
      'Check file permissions',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Write or append to gitignore file
 */
export async function writeGitignoreFile(filePath: string, content: string): Promise<void> {
  const fullPath = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

  try {
    // Check if file exists
    const exists = await fileExists(fullPath);

    if (exists) {
      // Append to existing gitignore if not already present
      const existing = await readFile(fullPath);
      const lines = existing.split('\n');
      const newLines = content.split('\n');

      for (const newLine of newLines) {
        if (newLine && !lines.includes(newLine)) {
          lines.push(newLine);
        }
      }

      await writeFile(fullPath, lines.join('\n'));
    } else {
      // Create new gitignore
      await writeFile(fullPath, content);
    }
  } catch (error) {
    throw new FileSystemError(
      'Failed to write .gitignore',
      'Check file permissions',
      error instanceof Error ? error : undefined
    );
  }
}

import {
  validateFilePath,
  validateFileName,
  validateFolderPathDetailed,
} from '../../src/utils/pathValidation';

function test(name: string, result: boolean, expected: boolean) {
  if (result === expected) {
    console.log(`✅ ${name}`);
  } else {
    console.error(
      `❌ ${name} - FAILED (Got: ${result}, Expected: ${expected})`
    );
    process.exit(1);
  }
}

console.log('Running Path Validation Tests...');

// 1. Validate File Path (Polish characters)
test(
  'validateFilePath("/metro/zażółć/gęślą_jaźń.jpg")',
  validateFilePath('/metro/zażółć/gęślą_jaźń.jpg').valid,
  true
);

// 2. Validate File Path (Invalid characters)
test(
  'validateFilePath("invalid|path.jpg")',
  validateFilePath('invalid|path.jpg').valid,
  false
);

// 3. Validate File Name (Polish characters)
test(
  'validateFileName("bąbel.jpg")',
  validateFileName('bąbel.jpg').valid,
  true
);

// 4. Test Path Traversal blocking
test(
  'validateFilePath("../secret.txt")',
  validateFilePath('../secret.txt').valid,
  false
);

// 5. Normalization in validateFolderPathDetailed
// On Windows path.normalize uses backslashes, but we replace them
// pathWithSlashes = 'foo//bar///baz' -> Expect: 'foo/bar/baz'
// Current logic: path.normalize('foo//bar///baz') -> 'foo\\bar\\baz' -> replaced to 'foo/bar/baz'
// Or 'foo/bar/baz' depends on OS separator logic.
// But we want to ensure it works correctly.

// validateFolderPathDetailed returns { valid: boolean }
test(
  'validateFolderPathDetailed("foo//bar///baz")',
  validateFolderPathDetailed('foo//bar///baz').valid,
  true
);

// Check depth limit (5)
test(
  'validateFolderPathDetailed("a/b/c/d/e/f")',
  validateFolderPathDetailed('a/b/c/d/e/f').valid, // depth 6
  false
);

console.log('All tests passed!');

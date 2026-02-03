const assert = require('assert');

// Regex from src/utils/pathValidation.ts
const SAFE_PATH_REGEX = /^[\p{L}0-9\/_\-\.\s]+$/u;
const SAFE_NAME_REGEX = /^[\p{L}0-9_\-\.]+$/u;

console.log('Verifying Regex Logic...');

function test(regex, input, expected, desc) {
    const result = regex.test(input);
    if (result === expected) {
        console.log(`✅ ${desc}`);
    } else {
        console.error(`❌ ${desc} - FAILED (Input: "${input}", Got: ${result}, Expected: ${expected})`);
        process.exit(1);
    }
}

// 1. Path with Polish characters
test(SAFE_PATH_REGEX, '/metro/zażółć/gęślą_jaźń.jpg', true, 'Polish Path');

// 2. Path with Invalid characters
test(SAFE_PATH_REGEX, 'invalid|path.jpg', false, 'Invalid Path');

// 3. Name with Polish characters
test(SAFE_NAME_REGEX, 'bąbel.jpg', true, 'Polish Name');

// 4. Name with Invalid characters
test(SAFE_NAME_REGEX, '../foo.txt', false, 'Path Traversal Name'); // ".." contains "." which is allowed, but "/" which is NOT allowed in name regex (no \/)
// Wait, SAFE_NAME_REGEX = /^[\p{L}0-9_\-\.]+$/u
// It allows dots.
// Does it allow slashes? No.
// So ".." is allowed? Yes, ".." matches `[\p{L}0-9_\-\.]+`.
// BUT validateFileName explicitly checks `name.includes('..')` BEFORE regex.
// So Regex alone permits "..". 
// This test checks ONLY REGEX. So ".." should return TRUE for regex check. 
// But "foo/bar" should return FALSE.
test(SAFE_NAME_REGEX, 'foo/bar', false, 'Slash in filename');

console.log('Regex verification passed!');

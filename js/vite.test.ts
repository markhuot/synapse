vi.mock('fs', async () => {
    const memfs = await vi.importActual('memfs');
    return {default: memfs.fs};
});
vi.mock('path', async () => {
    const memfs = await vi.importActual('memfs');
    return {default: memfs.path};
});

import * as memfs from 'memfs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synapse } from './vite.ts';
import { Parser } from 'acorn';

describe('synapse vite plugin', () => {
    beforeEach(() => {
        // Create the base directories needed for the test
        memfs.fs.mkdirSync('/test/.synapse/handlers', { recursive: true });
    });

    it('transforms php tagged template strings correctly', () => {
        const plugin = synapse();
        const inputCode = `
const foo = "bar";
const otherTag = foo\`bar\`;
const shouldBeReplaced = php\`echo date(\${dateFormat});\`.execute();
const shouldBeReplacedWithoutInterpolation = php\`return "name";\`.execute();`;

        // Mock the plugin's parse context
        const mockContext = {
            parse: (code) => Parser.parse(code, {
                sourceType: 'module',
                ecmaVersion: 'latest'
            })
        };

        // Configure the plugin
        plugin.configResolved({ root: '/test' });

        // Transform the code
        const result = plugin.transform.call(mockContext, inputCode, 'test.ts');

        // Strip whitespace for comparison
        const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();

        const expectedCode = `
const foo = "bar";
const otherTag = foo\`bar\`;
const shouldBeReplaced = php\`2k9sq\${dateFormat}\`.execute();
const shouldBeReplacedWithoutInterpolation = php\`2k9sq\`.execute();`;

        expect(normalizeWhitespace(result.code)).toBe(normalizeWhitespace(expectedCode));

        // Verify the PHP file was written
        const phpContent = memfs.fs.readFileSync('/test/.synapse/handlers/2k9sq.php', 'utf8');
        expect(phpContent).toBe('<?php\n\necho date($variable0);\n');
    });
});

import { vol, fs } from "memfs";

vi.mock('fs', async () => {
    const memfs = await vi.importActual('memfs');
    return {
        default: memfs.fs,
        ...memfs.fs,
    };
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synapse } from './vite.ts';
import { Parser } from 'acorn';
import { afterEach } from "node:test";

describe('synapse vite plugin', () => {
    beforeEach(() => {
        // Create the base directories needed for the test
        fs.mkdirSync('/test/.synapse/handlers', { recursive: true });
    });
    afterEach(() => {
        vol.reset();
    });

    const plugin = synapse();

    // Mock the plugin's parse context
    const mockContext = {
        parse: (code) => Parser.parse(code, {
            sourceType: 'module',
            ecmaVersion: 'latest'
        })
    };

    // Configure the plugin
    plugin.buildStart();
    plugin.configResolved({ root: '/test' });

    it('transforms php tagged template strings correctly', () => {
        const inputCode = `
            const foo = "bar";
            const otherTag = foo\`bar\`;
            const shouldBeReplaced = php\`echo date(\${dateFormat});\`.execute();
            const shouldBeReplacedWithoutInterpolation = php\`return "name";\`.execute();`;

        // Transform the code
        const result = plugin.transform.call(mockContext, inputCode, '/test/test.ts');

        // Strip whitespace for comparison
        const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();

        const expectedCode = `
            const foo = "bar";
            const otherTag = foo\`bar\`;
            const shouldBeReplaced = php\`1tqitjb\${dateFormat}\`.execute();
            const shouldBeReplacedWithoutInterpolation = php\`1tqitja\`.execute();`;

        expect(normalizeWhitespace(result.code)).toBe(normalizeWhitespace(expectedCode));

        // Verify the PHP file was written
        expect(fs.readFileSync('/test/.synapse/handlers/1tqitjb.php', 'utf8')).toBe('<?php\n\necho date($variable0);\n');
        expect(fs.readFileSync('/test/.synapse/handlers/1tqitja.php', 'utf8')).toBe('<?php\n\nreturn "name";\n');
    });

    it('writes a setup manifest for constants', () => {
        const inputCode = `
            export const setup = php\`return ['foo' => 'bar'];\`;`;

        // Transform the code
        const result = plugin.transform.call(mockContext, inputCode, '/test/test2.ts');
        plugin.generateBundle.call(mockContext);

        // Strip whitespace for comparison
        const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();

        const expectedCode = `
            export const setup = php\`m6mllh\`;`;

        expect(normalizeWhitespace(result.code)).toBe(normalizeWhitespace(expectedCode));

        // Verify the PHP file was written
        const phpContent = fs.readFileSync('/test/.synapse/handlers/m6mllh.php', 'utf8');
        expect(phpContent).toBe(`<?php\n\nreturn ['foo' => 'bar'];\n`);

        // Verify the manifest contains the setup mapping
        const manifestContent = fs.readFileSync('/test/.synapse/manifest.json', 'utf8');
        expect(JSON.parse(manifestContent)).toStrictEqual({setups: {'test2.ts': 'm6mllh'}});
    });

    it('writes a setup manifest for functions', () => {
        const inputCode = `
            export function setup() { return php\`return ['foo' => 'bar'];\`; }`;

        // Transform the code
        const result = plugin.transform.call(mockContext, inputCode, '/test/test2.ts');
        plugin.generateBundle.call(mockContext);

        // Strip whitespace for comparison
        const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();

        const expectedCode = `
            export function setup() { return php\`m6mllh\`; }`;

        expect(normalizeWhitespace(result.code)).toBe(normalizeWhitespace(expectedCode));

        // Verify the PHP file was written
        const phpContent = fs.readFileSync('/test/.synapse/handlers/m6mllh.php', 'utf8');
        expect(phpContent).toBe(`<?php\n\nreturn ['foo' => 'bar'];\n`);

        // Verify the manifest contains the setup mapping
        const manifestContent = fs.readFileSync('/test/.synapse/manifest.json', 'utf8');
        expect(JSON.parse(manifestContent)).toStrictEqual({setups: {'test2.ts': 'm6mllh'}});
    });

    it('extends the manifest, and its not last one wins', () => {
        const inputCode = `export function setup() { return php\`return ['foo' => 'bar'];\`; }`;

        // Transform the code
        plugin.transform.call(mockContext, inputCode, '/test/test2.ts');
        plugin.transform.call(mockContext, inputCode, '/test/test3.ts');
        plugin.transform.call(mockContext, inputCode, '/test/test4.ts');
        plugin.generateBundle.call(mockContext);

        // Verify the manifest contains the setup mapping
        const manifestContent = fs.readFileSync('/test/.synapse/manifest.json', 'utf8');
        expect(JSON.parse(manifestContent)).toStrictEqual({setups: {
            'test2.ts': 'm6mllh',
            'test3.ts': 'ka0kvo',
            'test4.ts': 'pu1onn',
        }});
    });
});

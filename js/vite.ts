import {createFilter} from '@rollup/pluginutils';
import * as fs from 'fs';
import * as path from 'path';
import {simple, ancestor} from 'acorn-walk';
import {generate} from 'astring';
import merge from 'deepmerge';

export function synapse(options:{
    include?: Array<string|RegExp>,
    exclude?: Array<string|RegExp>,
    synapsePath?: string,
} ={}) {
    const synapsePath = options.synapsePath || '.synapse/';
    const filter = createFilter(
        options.include || [/\.[jt]sx?$/],
        options.exclude || [/node_modules/, new RegExp(synapsePath)],
    );

    let viteRoot = '';
    let manifest;
    let manifestPath;
    let isDev = false;
    // Track imports and php tag usage
    const fileImports = new Map();
    const filesWithPhpTags = new Set();

    return {
        name: 'transform-php',
        buildStart() {
            manifest = {
                setups: {},
                hierarchy: {} // Add hierarchy to manifest
            };
            // Reset tracking on build start
            fileImports.clear();
            filesWithPhpTags.clear();
        },
        configResolved(config) {
            viteRoot = config.root;
            manifestPath = path.join(viteRoot, synapsePath, 'manifest.json');
            isDev = config.command === 'serve';
        },
        transform(code, id) {
            if (!filter(id)) return;

            const projectPath = path.relative(viteRoot, id);

            // Track imports first
            const ast = this.parse(code);
            simple(ast, {
                ImportDeclaration(node: any) {
                    const importPath = node.source?.value;
                    if (typeof importPath !== 'string') return;

                    // Handle relative imports
                    let absoluteImportPath = importPath.startsWith('.')
                        ? path.resolve(path.dirname(id), importPath)
                        : importPath;

                    // Add extension if not present
                    if (!path.extname(absoluteImportPath)) {
                        // Try common extensions
                        const extensions = ['.ts', '.tsx', '.js', '.jsx'];
                        for (const ext of extensions) {
                            const pathWithExt = absoluteImportPath + ext;
                            if (fs.existsSync(pathWithExt)) {
                                absoluteImportPath = pathWithExt;
                                break;
                            }
                        }
                    }

                    if (!fileImports.has(id)) {
                        fileImports.set(id, new Set());
                    }
                    fileImports.get(id).add(absoluteImportPath);
                }
            });

            // early bail to speed up compiles, but after tracking imports
            if (!code.includes('php`')) {
                return {
                    code,
                    map: null,
                }
            }

            // Mark this file as containing php tags
            filesWithPhpTags.add(id);

            let tagIndex = 0;

            ancestor(ast, {
                ImportDeclaration(node) {
                    // check if the php import is renamed
                    // console.log(node);
                },
                TaggedTemplateExpression(node: any, _state, ancestors) {
                    if (node.tag.name === 'php') {
                        const hash = generateFilesystemSafeHash(`${projectPath}-${tagIndex++}`);
                        const phpCodeBlocks = node.quasi.quasis.map(element => generate(element));

                        ancestors.reverse().forEach(ancestor => {
                            if (ancestor.type === 'ExportNamedDeclaration' && (
                                // @ts-ignore too much type monkeying when we can just use optionals
                                ancestor.declaration.type === 'VariableDeclaration' &&
                                // @ts-ignore too much type monkeying when we can just use optionals
                                ancestor.declaration.declarations?.[0]?.id?.name === 'setup'
                            )) {
                                manifest.setups[projectPath] = hash;
                            }
                            if (ancestor.type === 'ExportNamedDeclaration' && (
                                // @ts-ignore too much type monkeying when we can just use optionals
                                ancestor.declaration.type === 'FunctionDeclaration' &&
                                // @ts-ignore too much type monkeying when we can just use optionals
                                ancestor.declaration.id?.name === 'setup'
                            )) {
                                manifest.setups[projectPath] = hash;
                            }
                        });

                        writePhp(viteRoot, synapsePath, hash, phpCodeBlocks.flatMap((item, index) => {
                            if (index < phpCodeBlocks.length - 1) {
                                return [item, `$variable${index}`];
                            }

                            return [item];
                        }).join(''));

                        node.quasi.quasis = node.quasi.quasis.map((quasi, index) => {
                            return {
                                ...quasi,
                                value: {
                                    cooked: index === 0 ? hash : '',
                                    raw: index === 0 ? hash : '',
                                }
                            }
                        });

                    }
                },
            });

            code = generate(ast, {comments: true});

            if (isDev && manifest.setups[projectPath]) {
                updateManifest({ setups: { [projectPath]: manifest.setups[projectPath] } }, manifestPath);
            }

            return {
                code,
                map: null,
            };
        },
        generateBundle() {
            // Build the hierarchy before writing the manifest
            const buildHierarchy = (filePath) => {
                const result = {};
                const imports = fileImports.get(filePath) || new Set();

                for (const importPath of imports) {
                    // Only include this import if it contains php tags or has children that do
                    if (filesWithPhpTags.has(importPath)) {
                        const relativePath = path.relative(viteRoot, importPath);
                        result[relativePath] = buildHierarchy(importPath);
                    } else if (fileImports.has(importPath)) {
                        const childHierarchy = buildHierarchy(importPath);
                        // Only include if child hierarchy is not empty
                        if (Object.keys(childHierarchy).length > 0) {
                            const relativePath = path.relative(viteRoot, importPath);
                            result[relativePath] = childHierarchy;
                        }
                    }
                }

                return result;
            };

            // Build hierarchy for all entry points (files that aren't imported by others)
            const allFiles = new Set([...fileImports.keys()]);
            const importedFiles = new Set();
            fileImports.forEach(imports => {
                imports.forEach(imp => importedFiles.add(imp));
            });

            const entryPoints = [...allFiles].filter(file => !importedFiles.has(file));

            entryPoints.forEach(entryPoint => {
                const hierarchy = buildHierarchy(entryPoint);
                if (Object.keys(hierarchy).length > 0 || filesWithPhpTags.has(entryPoint)) {
                    const relativePath = path.relative(viteRoot, entryPoint);
                    manifest.hierarchy[relativePath] = hierarchy;
                }
            });

            writeManifest(manifest, manifestPath);
        }
    }
}

function updateManifest(updatedManifest, manifestPath) {
    if (Object.entries(updatedManifest.setups).length === 0) {
        return;
    }

    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    let existingManifest;
    if (fs.existsSync(manifestPath)) {
        existingManifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: 'utf8' }));
    }
    else {
        existingManifest = {};
    }
    const newManifest = merge(existingManifest, updatedManifest);
    fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2), { encoding: 'utf8' });
}

function writeManifest(manifest, manifestPath) {
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8' });
}

function writePhp(root, synapsePath, hash, code) {
    const filePath = path.join(root, synapsePath, 'handlers', `${hash}.php`);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, getPhpSkeleton(hash, code), { encoding: 'utf8' });
}

function generateFilesystemSafeHash(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}

function getPhpSkeleton(hash, code) {
    return `
<?php

${code}
`.trim() + "\n";
}

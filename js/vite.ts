import {createFilter} from '@rollup/pluginutils';
import * as fs from 'fs';
import * as path from 'path';
import {simple} from 'acorn-walk';
import {generate} from 'astring';

export function synapse(options={}) {
    const filter = createFilter(
        options.include || [],
        options.exclude || [/node_modules/],
    );

    let viteRoot = '';
    const handlerPath = options.handlerPath || '.synapse/handlers/';

    return {
        name: 'transform-php',
        configResolved(config) {
            viteRoot = config.root;
        },
        transform(code, id) {
            if (!filter(id)) return;

            // early bail to speed up compiles
            if (! code.includes('php`')) {
                return {
                    code,
                    map: null,
                }
            }

            let tagIndex = 0;
            const ast = this.parse(code);

            simple(ast, {
                ImportDeclaration(node) {
                    // check if the php import is renamed
                    // console.log(node);
                },
                TaggedTemplateExpression(node) {
                    if (node.tag.name === 'php') {
                        const projectPath = path.relative(viteRoot, id);
                        const hash = generateFilesystemSafeHash(`${projectPath}-${tagIndex++}`);
                        const phpCodeBlocks = node.quasi.quasis.map(element => generate(element));

                        writePhp(viteRoot, handlerPath, hash, phpCodeBlocks.flatMap((item, index) => {
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

            return {
                code,
                map: null,
            };
        }
    }
}

function writePhp(root, handlerPath, hash, code) {
    const filePath = path.join(root, handlerPath, `${hash}.php`);

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

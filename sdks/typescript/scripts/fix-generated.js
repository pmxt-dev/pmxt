const fs = require('fs');
const path = require('path');

const generatedModelsDir = path.resolve(__dirname, '../generated/src/models');
const targetFile = path.join(generatedModelsDir, 'FilterMarketsRequestArgsInnerOneOf.ts');

function fixInstanceOfFunction() {
    if (!fs.existsSync(targetFile)) {
        console.log('Target file does not exist, skipping fix:', targetFile);
        return;
    }

    let content = fs.readFileSync(targetFile, 'utf8');

    // Check if the instanceOf function is missing
    if (content.includes('export function instanceOfFilterMarketsRequestArgsInnerOneOf')) {
        console.log('instanceOf function already exists, skipping fix');
        return;
    }

    // Add the missing instanceOf function after the type definition
    const typeDefPattern = /export type FilterMarketsRequestArgsInnerOneOf = object \| string;/;

    if (!typeDefPattern.test(content)) {
        console.warn('Could not find type definition pattern, skipping fix');
        return;
    }

    const fixedContent = content.replace(
        typeDefPattern,
        `export type FilterMarketsRequestArgsInnerOneOf = object | string;

export function instanceOfFilterMarketsRequestArgsInnerOneOf(value: any): boolean {
    return typeof value === 'object' || typeof value === 'string';
}`
    );

    fs.writeFileSync(targetFile, fixedContent, 'utf8');
    console.log('Added missing instanceOf function to FilterMarketsRequestArgsInnerOneOf.ts');
}

console.log('Fixing generated code...');
fixInstanceOfFunction();
console.log('Generated code fixes complete.');
